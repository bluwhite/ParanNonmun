/* APA -> 파란 논문 필드 변환 모듈 */
(function(global){
  "use strict";

  let journalEntries=[];

  function cleanText(value){
    return String(value??"")
      .normalize("NFKC")
      .replace(/\u00a0/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function stripEdgePunctuation(value){
    return cleanText(value)
      .replace(/^[\s,.;:·]+/,"")
      .replace(/[\s,.;:·]+$/,"")
      .trim();
  }

  function stripJournalDecorations(value){
    return stripEdgePunctuation(value)
      .replace(/^[『「〈《<\[]+/,"")
      .replace(/[』」〉》>\]]+$/,"")
      .replace(/^\*+|\*+$/g,"")
      .trim();
  }

  function searchKey(value){
    return cleanText(value)
      .toLocaleLowerCase()
      .replace(/[『』「」〈〉《》<>\[\]*_]/g,"")
      .replace(/\s+/g,"");
  }

  async function loadJournalInfo(url="../reference-data/journal-info.json"){
    const response=await fetch(url,{cache:"no-store"});
    if(!response.ok){
      throw new Error(`학술지 정보 파일을 읽지 못했습니다. (${response.status})`);
    }

    const data=await response.json();
    const rows=Array.isArray(data) ? data : data.journals;

    if(!Array.isArray(rows)){
      throw new Error("journal-info.json 형식이 올바르지 않습니다.");
    }

    journalEntries=rows
      .map(row=>({
        journal:cleanText(row.journal),
        publishers:Array.isArray(row.publishers)
          ? row.publishers.map(cleanText).filter(Boolean)
          : (row.publisher ? [cleanText(row.publisher)] : [])
      }))
      .filter(row=>row.journal)
      .map(row=>({
        ...row,
        key:searchKey(row.journal)
      }))
      .sort((a,b)=>b.key.length-a.key.length);

    return journalEntries.length;
  }

  function findYear(text){
    let match=text.match(/\(\s*((?:19|20)\d{2})[a-z]?\s*\)/i);
    if(match){
      return {
        year:match[1],
        index:match.index,
        end:match.index+match[0].length
      };
    }

    match=text.match(/(?:^|[\s.])((?:19|20)\d{2})[a-z]?\s*\./i);
    if(match){
      const yearOffset=match[0].indexOf(match[1]);
      return {
        year:match[1],
        index:match.index+yearOffset,
        end:match.index+match[0].length
      };
    }

    return null;
  }

  function findMetadataStart(remainder){
    const patterns=[
      /,\s*\d+\s*\(\s*[^)]+\s*\)\s*,\s*(?:pp?\.\s*)?\d+(?:\s*[-–—]\s*\d+)?/i,
      /,\s*\d+\s*,\s*(?:pp?\.\s*)?\d+(?:\s*[-–—]\s*\d+)?/i
    ];

    for(const pattern of patterns){
      const match=remainder.match(pattern);
      if(match){
        return {
          index:match.index,
          text:match[0]
        };
      }
    }

    return null;
  }

  function findKnownJournal(remainder){
    if(!journalEntries.length)return null;

    const meta=findMetadataStart(remainder);
    const beforeMeta=stripEdgePunctuation(
      meta ? remainder.slice(0,meta.index) : remainder
    );
    const beforeKey=searchKey(beforeMeta);

    if(!beforeKey)return null;

    // APA에서는 학술지명이 권/호 정보 바로 앞에 위치하므로,
    // 학술지 목록 중 beforeMeta의 '끝부분'과 일치하는 가장 긴 항목만 선택한다.
    for(const entry of journalEntries){
      if(!beforeKey.endsWith(entry.key))continue;

      const escaped=entry.journal
        .replace(/[.*+?^${}()|[\]\\]/g,"\\$&")
        .replace(/\s+/g,"\\s*");

      const pattern=new RegExp(
        `[『「〈《<\\[]?\\s*${escaped}\\s*[』」〉》>\\]]?\\s*$`,
        "i"
      );

      const match=beforeMeta.match(pattern);
      if(match){
        return {
          entry,
          index:match.index,
          end:match.index+match[0].length,
          matchedText:match[0],
          metadataIndex:meta ? meta.index : remainder.length
        };
      }

      // 정규화 기준으로는 끝이 일치하지만 실제 표기 차이 때문에
      // 위치를 못 찾는 드문 경우에는 원문 끝에서 canonical 길이만큼 추정하지 않고
      // fallback 파서에 맡긴다.
    }

    return null;
  }

  function parseTail(tail){
    const result={
      volume:"",
      issue:"",
      startPage:"",
      endPage:""
    };

    let text=cleanText(tail)
      .replace(/^,+/,"")
      .replace(/^\.+/,"")
      .trim();

    const volumeIssue=text.match(
      /(?:^|[,;]\s*|\s)(\d+)\s*\(\s*([^)]+?)\s*\)/
    );

    if(volumeIssue){
      result.volume=volumeIssue[1]||"";
      result.issue=stripEdgePunctuation(volumeIssue[2]||"");
    }else{
      const volumeOnly=text.match(
        /(?:^|[,;]\s*|\s)(\d+)\s*(?=,|;|\s+\d+\s*[-–—])/
      );
      if(volumeOnly)result.volume=volumeOnly[1]||"";
    }

    const pages=text.match(
      /(?:^|[,;:\s])(?:pp?\.\s*)?(\d+)\s*[-–—]\s*(\d+)(?=\D|$)/i
    );

    if(pages){
      result.startPage=pages[1]||"";
      result.endPage=pages[2]||"";
    }else{
      const singlePage=text.match(
        /(?:^|[,;:\s])(?:p\.\s*)?(\d+)(?=\s*(?:[.,]|https?:|doi:|$))/i
      );
      if(singlePage){
        result.startPage=singlePage[1]||"";
      }
    }

    return result;
  }

  function fallbackJournalAndTitle(remainder){
    const pagePattern=
      /,\s*(\d+)(?:\s*\(\s*([^)]+?)\s*\))?\s*,\s*(\d+)\s*[-–—]\s*(\d+)/;

    const match=remainder.match(pagePattern);
    let beforeMeta=match
      ? remainder.slice(0,match.index)
      : remainder;

    beforeMeta=beforeMeta.trim().replace(/[.,;:\s]+$/,"");

    const parts=beforeMeta
      .split(/\.\s+/)
      .map(stripEdgePunctuation)
      .filter(Boolean);

    if(parts.length>=2){
      const journal=stripJournalDecorations(parts.pop());
      return {
        title:parts.join(". "),
        journal,
        tail:match ? remainder.slice(match.index+1) : "",
        metadata:match
          ? {
              volume:match[1]||"",
              issue:stripEdgePunctuation(match[2]||""),
              startPage:match[3]||"",
              endPage:match[4]||""
            }
          : parseTail("")
      };
    }

    return {
      title:stripEdgePunctuation(beforeMeta),
      journal:"",
      tail:"",
      metadata:parseTail("")
    };
  }

  function lookupPublisher(journal){
    const target=searchKey(journal);
    if(!target)return null;

    const found=journalEntries.find(entry=>entry.key===target);
    if(!found)return null;

    return {
      journal:found.journal,
      publishers:[...found.publishers]
    };
  }

  function parse(text){
    const source=cleanText(
      String(text||"")
        .replace(/<br\s*\/?>/gi,"\n")
        .replace(/\r\n?/g,"\n")
        .replace(/\n+/g," ")
    );

    if(!source){
      throw new Error("APA 참고문헌 내용을 입력하세요.");
    }

    const yearInfo=findYear(source);
    if(!yearInfo){
      throw new Error("APA에서 출판연도(예: 2024)를 찾지 못했습니다.");
    }

    const authors=stripEdgePunctuation(
      source.slice(0,yearInfo.index)
    );

    const remainder=stripEdgePunctuation(
      source.slice(yearInfo.end)
    );

    let title="";
    let journal="";
    let tail="";
    let publisherCandidates=[];
    let matchedFromJournalData=false;

    const known=findKnownJournal(remainder);

    if(known && known.index>=0){
      title=stripEdgePunctuation(
        remainder.slice(0,known.index)
      );
      journal=known.entry.journal;
      tail=remainder.slice(known.metadataIndex);
      publisherCandidates=[...known.entry.publishers];
      matchedFromJournalData=true;
    }else{
      const fallback=fallbackJournalAndTitle(remainder);
      title=fallback.title;
      journal=fallback.journal;
      tail=fallback.tail;

      const lookup=lookupPublisher(journal);
      if(lookup){
        journal=lookup.journal;
        publisherCandidates=lookup.publishers;
        matchedFromJournalData=true;
      }

      if(fallback.metadata.volume ||
         fallback.metadata.issue ||
         fallback.metadata.startPage ||
         fallback.metadata.endPage){
        return {
          check:"",
          authors,
          year:yearInfo.year,
          title,
          journal,
          volume:fallback.metadata.volume,
          issue:fallback.metadata.issue,
          publisher:publisherCandidates[0]||"",
          startPage:fallback.metadata.startPage,
          endPage:fallback.metadata.endPage,
          memo:"",
          pdf:"",
          _format:"APA",
          _journalMatched:matchedFromJournalData,
          _publisherCandidates:publisherCandidates
        };
      }
    }

    const metadata=parseTail(tail);

    return {
      check:"",
      authors,
      year:yearInfo.year,
      title,
      journal,
      volume:metadata.volume,
      issue:metadata.issue,
      publisher:publisherCandidates[0]||"",
      startPage:metadata.startPage,
      endPage:metadata.endPage,
      memo:"",
      pdf:"",
      _format:"APA",
      _journalMatched:matchedFromJournalData,
      _publisherCandidates:publisherCandidates
    };
  }

  global.ParanApaParser=Object.freeze({
    loadJournalInfo,
    parse,
    lookupPublisher
  });
})(typeof window!=="undefined" ? window : globalThis);
