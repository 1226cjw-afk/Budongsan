// 카카오 지도 SDK URL — layout의 <link rel="preload">와 KakaoMap의 동적 <script>가 공유한다.
// ⚠️ 두 URL이 한 글자라도 다르면 preload가 매칭되지 않아 SDK를 두 번 받는다(브라우저 콘솔에
//    "preloaded but not used" 경고). 그래서 한 곳에서만 만든다.
// 왜 preload인가(2026-10-05 prod 실측, 모바일 CPU 4x·4G): 스크립트 삽입은 하이드레이션 뒤라
// 지도 타일 요청이 5.8s에야 시작했다. preload는 HTML 파싱 시점에 SDK 다운로드를 시작한다.
export const KAKAO_SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false&libraries=services`;

// SDK 로더(dapi)가 본체를 t1.daumcdn.net에서, 타일을 mts.daumcdn.net에서 받는다(실측 워터폴).
export const KAKAO_ORIGINS = ["https://dapi.kakao.com", "https://t1.daumcdn.net", "https://mts.daumcdn.net"];
