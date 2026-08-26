/* MLA -> 파란 논문 필드 변환 모듈
 * 우선 대상: 학술지 논문
 * 예:
 * Smith, John, and Jane Doe. "Article Title." Journal Name,
 * vol. 12, no. 3, 2024, pp. 10-25.
 */
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

  function stripEdge(value){
    return cleanText(value)
      .replace(/^[\s,.;:]+/,"")
      .replace(/[\s,.;:]+$/,"")
      .trim();
  }

  function stripJournalDecorations(value){
    return stripEdge(value)
      .replace(/^[『「〈《<\[]+/,"")
      .replace(/[』」〉》>\]]+$/,"")
      .replace(/^\*+|\*+$/g,"")
      .trim();
  }

  function searchKey(value){
    return cleanText(value)
      .toLocaleLowerCase()
      .replace(/[『』「」〈〉《》<>\[\]*_"“”‘’']/g,"")
      .replace(/[.,;:]/g,"")
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
      .map(row=>({...row,key:searchKey(row.journal)}))
      .sort((a,b)=>b.key.length-a.key.length);

    return journalEntries.length;
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

  function findKnownJournal(text){
    if(!journalEntries.length)return null;

    for(const entry of journalEntries){
      const escaped=entry.journal
        .replace(/[.*+?^${}()|[\]\\]/g,"\\$&")
        .replace(/\s+/g,"\\s*");

      const pattern=new RegExp(
        `[『「〈《<\\[]?\\s*${escaped}\\s*[』」〉》>\\]]?`,
        "i"
      );

      const match=text.match(pattern);
      if(match){
        return {
          entry,
          index:match.index,
          end:match.index+match[0].length
        };
      }
    }

    return null;
  }

  function extractTitleAndPositions(source){
    const quotePatterns=[
      /["“](.+?)["”]/,
      /['‘](.+?)['’]/,
      /「(.+?)」/,
      /『(.+?)』/
    ];

    for(const pattern of quotePatterns){
      const match=source.match(pattern);
      if(match){
        return {
          title:stripEdge(match[1]),
          start:match.index,
          end:match.index+match[0].length
        };
      }
    }

    return null;
  }

  function parseMetadata(tail){
    const result={
      volume:"",
      issue:"",
      year:"",
      startPage:"",
      endPage:""
    };

    const text=cleanText(tail);

    const volume=text.match(/\bvol\.?\s*([0-9A-Za-z-]+)/i);
    if(volume)result.volume=stripEdge(volume[1]);

    const issue=text.match(/\bno\.?\s*([0-9A-Za-z-]+)/i);
    if(issue)result.issue=stripEdge(issue[1]);

    const year=text.match(/\b((?:19|20)\d{2})\b/);
    if(year)result.year=year[1];

    const pages=text.match(/\bpp?\.?\s*(\d+)\s*[-–—]\s*(\d+)/i);

    if(pages){
      result.startPage=pages[1];
      result.endPage=pages[2];
    }else{
      const single=text.match(/\bp\.?\s*(\d+)\b/i);
      if(single)result.startPage=single[1];
    }

    return result;
  }

  function fallbackJournal(afterTitle){
    const boundary=afterTitle.search(
      /,\s*(?:vol\.?|no\.?|(?:19|20)\d{2}\b|pp?\.)/i
    );

    if(boundary>=0){
      return {
        journal:stripJournalDecorations(afterTitle.slice(0,boundary)),
        tail:afterTitle.slice(boundary+1)
      };
    }

    const comma=afterTitle.indexOf(",");
    if(comma>=0){
      return {
        journal:stripJournalDecorations(afterTitle.slice(0,comma)),
        tail:afterTitle.slice(comma+1)
      };
    }

    return {
      journal:stripJournalDecorations(afterTitle),
      tail:""
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
      throw new Error("MLA 참고문헌 내용을 입력하세요.");
    }

    const titleInfo=extractTitleAndPositions(source);
    if(!titleInfo){
      throw new Error(
        'MLA 논문명을 찾지 못했습니다. 논문명이 "따옴표"로 표시되어 있는지 확인하세요.'
      );
    }

    const rawAuthors=stripEdge(source.slice(0,titleInfo.start));
    const authors=global.ParanAuthorUtils
      ? global.ParanAuthorUtils.normalizeAuthors(rawAuthors)
      : rawAuthors.replace(/\s*,?\s+and\s+/gi,"·");

    const afterTitle=stripEdge(source.slice(titleInfo.end));
    let journal="";
    let tail="";
    let publisherCandidates=[];
    let matchedFromJournalData=false;

    const known=findKnownJournal(afterTitle);

    if(known){
      journal=known.entry.journal;
      tail=afterTitle.slice(known.end);
      publisherCandidates=[...known.entry.publishers];
      matchedFromJournalData=true;
    }else{
      const fallback=fallbackJournal(afterTitle);
      journal=fallback.journal;
      tail=fallback.tail;

      const lookup=lookupPublisher(journal);
      if(lookup){
        journal=lookup.journal;
        publisherCandidates=lookup.publishers;
        matchedFromJournalData=true;
      }
    }

    const metadata=parseMetadata(tail || afterTitle);

    if(!metadata.year){
      const yearMatch=source.match(/\b((?:19|20)\d{2})\b/);
      if(yearMatch)metadata.year=yearMatch[1];
    }

    return {
      check:"",
      authors,
      year:metadata.year,
      title:titleInfo.title,
      journal,
      volume:metadata.volume,
      issue:metadata.issue,
      publisher:publisherCandidates[0]||"",
      startPage:metadata.startPage,
      endPage:metadata.endPage,
      memo:"",
      pdf:"",
      _format:"MLA",
      _journalMatched:matchedFromJournalData,
      _publisherCandidates:publisherCandidates
    };
  }

  global.ParanMlaParser=Object.freeze({
    loadJournalInfo,
    parse,
    lookupPublisher
  });
})(typeof window!=="undefined" ? window : globalThis);
