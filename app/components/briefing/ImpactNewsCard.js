"use client";

// 💰 내게 영향 있는 뉴스 — 대출·금리/정책·세금 + 관심지역 기사.
// 분류는 별도 로직 없이 news.classifyNews()의 제목 룰을 그대로 쓴다.

import { classifyNews } from "../../lib/news";
import { card, cardHead, headSub, row, rowDivider, rowName, rowMeta } from "./styles";

export default function ImpactNewsCard({ news, hasIncome }) {
  return (
    <section>
      <div style={cardHead}>
        💰 내게 영향 있는 뉴스
        {hasIncome && <span style={headSub}> · 대출 한도에 영향 가능</span>}
      </div>
      <div style={card}>
        {news.map((it, i) => (
          <a
            key={it.link}
            href={it.link}
            target="_blank"
            rel="noreferrer"
            className="news-row"
            style={{
              ...row,
              textDecoration: "none",
              color: "inherit",
              ...(i > 0 ? rowDivider : null),
            }}
          >
            <div style={rowName}>{it.title}</div>
            <div style={rowMeta}>
              {it.source} · {it.cat || classifyNews(it.title)}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
