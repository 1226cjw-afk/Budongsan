#!/usr/bin/env node
// Budongsan CLAUDE.md: "검증은 build+test 둘 다."
// test 는 node:test 66개라 빠르므로 소스 편집 직후 자동으로 돌린다.
// (build 는 느려서 훅으로 안 돌린다 — 커밋 전에 `npx next build` 를 따로 할 것)
//
// 2026-08-14 감사에서 드러났듯 test 도 호출부 결함은 못 잡는다.
// 이 훅은 "이미 있는 테스트를 깼는가"만 즉시 알려주는 장치다.

const { execFileSync } = require("node:child_process");
const path = require("node:path");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let file = "";
  try {
    const j = JSON.parse(raw || "{}");
    file = j.tool_response?.filePath || j.tool_input?.file_path || "";
  } catch {
    process.exit(0);
  }

  // 소스·테스트만 대상. 문서(.md)·설정 편집마다 도는 것을 막는다.
  const rel = String(file).replace(/\\/g, "/");
  if (!/\/(app|tests)\/.*\.(js|mjs|jsx)$/.test(rel)) process.exit(0);

  const root = path.resolve(__dirname, "..", "..");
  try {
    execFileSync("npm", ["test"], {
      cwd: root,
      stdio: "pipe",
      shell: true,
      timeout: 150000,
      encoding: "utf8",
    });
    process.exit(0); // 통과 — 조용히
  } catch (e) {
    // node --test 의 spec 리포터 형식에 맞춰 요약한다.
    // (글리프 ℹ/✖ 에 의존하지 않도록 숫자 패턴으로 잡는다 — 콘솔 인코딩에 안 흔들리게)
    const all = String((e.stdout || "") + (e.stderr || "")).split("\n");
    const counters = all.filter((l) => /^\W*(tests|pass|fail)\s+\d+\s*$/.test(l.trim()));
    const start = all.findIndex((l) => /failing tests:/.test(l));
    const detail = start >= 0 ? all.slice(start, start + 30) : all.slice(-30);
    const out = [...counters, "", ...detail].join("\n").trim();
    console.log(
      JSON.stringify({
        decision: "block",
        reason:
          "npm test 실패 — 방금 편집이 기존 테스트를 깼다. 다음 작업 전에 먼저 고칠 것:\n" +
          (out || "(요약 추출 실패 — `npm test` 를 직접 돌려서 확인할 것)"),
      })
    );
    process.exit(0);
  }
});
