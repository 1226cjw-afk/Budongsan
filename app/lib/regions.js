// 지역(LAWD_CD = 법정동 시군구 5자리, 행정표준코드) 목록 + 지오코딩 보조 헬퍼.
// 클라이언트(드롭다운)와 서버(지오코딩 지역 검증) 양쪽에서 사용한다.
// ⚠️ 경기 코드는 법정동 시군구 5자리. **부천(41190)·화성(41590) 상위코드는 실거래 0건** →
//    구별 코드로 분리해야 데이터가 옴(부천 4119x 3구 / 화성 2025 일반구 4159x 4구). 2026-06-25 검증.

export const REGIONS = [
  {
    sido: "서울",
    items: [
      { code: "11110", name: "종로구" },
      { code: "11140", name: "중구" },
      { code: "11170", name: "용산구" },
      { code: "11200", name: "성동구" },
      { code: "11215", name: "광진구" },
      { code: "11230", name: "동대문구" },
      { code: "11260", name: "중랑구" },
      { code: "11290", name: "성북구" },
      { code: "11305", name: "강북구" },
      { code: "11320", name: "도봉구" },
      { code: "11350", name: "노원구" },
      { code: "11380", name: "은평구" },
      { code: "11410", name: "서대문구" },
      { code: "11440", name: "마포구" },
      { code: "11470", name: "양천구" },
      { code: "11500", name: "강서구" },
      { code: "11530", name: "구로구" },
      { code: "11545", name: "금천구" },
      { code: "11560", name: "영등포구" },
      { code: "11590", name: "동작구" },
      { code: "11620", name: "관악구" },
      { code: "11650", name: "서초구" },
      { code: "11680", name: "강남구" },
      { code: "11710", name: "송파구" },
      { code: "11740", name: "강동구" },
    ],
  },
  {
    sido: "경기",
    items: [
      { code: "41111", name: "수원시 장안구" },
      { code: "41113", name: "수원시 권선구" },
      { code: "41115", name: "수원시 팔달구" },
      { code: "41117", name: "수원시 영통구" },
      { code: "41131", name: "성남시 수정구" },
      { code: "41133", name: "성남시 중원구" },
      { code: "41135", name: "성남시 분당구" },
      { code: "41150", name: "의정부시" },
      { code: "41171", name: "안양시 만안구" },
      { code: "41173", name: "안양시 동안구" },
      // 부천시: 행정구 폐지됐으나 실거래 API는 법정 구코드(41190 상위는 0건)별로만 제공
      { code: "41192", name: "부천시 원미구" },
      { code: "41194", name: "부천시 소사구" },
      { code: "41196", name: "부천시 오정구" },
      { code: "41210", name: "광명시" },
      { code: "41220", name: "평택시" },
      { code: "41250", name: "동두천시" },
      { code: "41271", name: "안산시 상록구" },
      { code: "41273", name: "안산시 단원구" },
      { code: "41281", name: "고양시 덕양구" },
      { code: "41285", name: "고양시 일산동구" },
      { code: "41287", name: "고양시 일산서구" },
      { code: "41290", name: "과천시" },
      { code: "41310", name: "구리시" },
      { code: "41360", name: "남양주시" },
      { code: "41370", name: "오산시" },
      { code: "41390", name: "시흥시" },
      { code: "41410", name: "군포시" },
      { code: "41430", name: "의왕시" },
      { code: "41450", name: "하남시" },
      { code: "41461", name: "용인시 처인구" },
      { code: "41463", name: "용인시 기흥구" },
      { code: "41465", name: "용인시 수지구" },
      { code: "41480", name: "파주시" },
      { code: "41500", name: "이천시" },
      { code: "41550", name: "안성시" },
      { code: "41570", name: "김포시" },
      // 화성시: 2025 일반구(만세/효행/병점/동탄) 출범 → 41590 상위는 0건, 구별 코드로 제공
      { code: "41591", name: "화성시 만세구" },
      { code: "41593", name: "화성시 효행구" },
      { code: "41595", name: "화성시 병점구" },
      { code: "41597", name: "화성시 동탄구" },
      { code: "41610", name: "광주시" },
      { code: "41630", name: "양주시" },
      { code: "41650", name: "포천시" },
      { code: "41670", name: "여주시" },
      { code: "41800", name: "연천군" },
      { code: "41820", name: "가평군" },
      { code: "41830", name: "양평군" },
    ],
  },
];

export const ALL_REGIONS = REGIONS.flatMap((g) =>
  g.items.map((it) => ({ ...it, sido: g.sido }))
);

// LAWD_CD → 시군구 이름 (예: "안양시 동안구").
export function regionName(code) {
  return ALL_REGIONS.find((r) => r.code === code)?.name ?? code;
}

// 지오코딩 쿼리 앞에 붙일 지역 경로 (예: "경기 안양시 동안구").
export function regionPrefix(code) {
  const r = ALL_REGIONS.find((x) => x.code === code);
  return r ? `${r.sido} ${r.name}` : "";
}

// 공고 주소("서울특별시 구로구 오리로1165") → LAWD_CD. 청약 공고는 시군구 코드를 주지 않고
// 주소 문자열만 주는데, 규제지역 판정(loanPolicy.isRegulated)에는 코드가 필요해서 역매칭한다.
// ⚠️ **이름이 긴 것부터** 봐야 한다 — "수원시 장안구"·"수원시 권선구"처럼 한 시에 여러 구가
//    있을 때 짧은 쪽을 먼저 맞추면 엉뚱한 구로 붙는다. 다중 토큰은 전부 포함될 때만 인정.
// ⚠️ 시도(서울/경기)도 함께 확인한다. 안 그러면 타 시도의 동명 자치구(인천 중구 등)가
//    서울 중구(11140)로 잘못 붙어 규제지역 판정이 뒤집힌다.
// 목록에 없는 지역(인천 등)은 null — 호출부는 규제 판정을 비규제로 흘린다.
export function lawdCdFromAddress(address) {
  if (!address) return null;
  const a = String(address).replace(/\s+/g, " ");
  const byLength = [...ALL_REGIONS].sort((x, y) => y.name.length - x.name.length);
  for (const r of byLength) {
    if (!a.includes(r.sido)) continue;
    if (r.name.split(" ").every((part) => a.includes(part))) return r.code;
  }
  return null;
}

// 지오코딩 결과 주소가 이 지역인지 검증할 토큰.
// 구가 있으면 가장 구체적인 구(예: "동안구"), 없으면 시 이름(예: "의정부시").
export function regionToken(code) {
  const name = regionName(code);
  const parts = name.split(" ");
  const gu = parts.find((p) => p.endsWith("구"));
  return gu ?? name;
}
