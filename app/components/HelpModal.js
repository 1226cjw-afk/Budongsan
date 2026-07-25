// LTV/DSR 계산식 도움말 모달.

import { C } from "../lib/palette";
import { modalOverlay, modalCard, closeBtn, helpBlock, helpHead, helpBody } from "./mapStyles";

export default function HelpModal({ onClose }) {
  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={closeBtn} aria-label="닫기">×</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, paddingRight: 20 }}>
          대출 한도는 이렇게 계산해요
        </div>

        <div style={helpBlock}>
          <div style={helpHead}>LTV · 담보인정비율</div>
          <div style={helpBody}>
            집값 대비 빌릴 수 있는 비율이에요.<br />
            • 규제지역 <b>40%</b> (생애최초 70%) · 비규제 <b>70%</b><br />
            • 집값 한도 상한: 15억↓ <b>6억</b> / 15~25억 <b>4억</b> / 25억↑ <b>2억</b><br />
            <span style={{ color: C.sub }}>LTV 한도 = min(집값 × 비율, 한도 상한)</span>
          </div>
        </div>

        <div style={helpBlock}>
          <div style={helpHead}>DSR · 총부채원리금상환비율</div>
          <div style={helpBody}>
            연소득 대비 1년 원리금 상환액이 <b>40%</b>를 넘지 않게 제한해요.<br />
            • 심사 땐 <b>스트레스 금리</b>(규제지역 +3.0%p)를 더해 더 깐깐하게 계산<br />
            <span style={{ color: C.sub }}>DSR 한도 ≈ (연소득 × 40% − 기존 상환액) ÷ 1만원당 연상환액</span>
          </div>
        </div>

        <div style={helpBlock}>
          <div style={helpHead}>최종 한도</div>
          <div style={helpBody}>
            <b>LTV·DSR 중 더 작은 값</b>이 실제 대출 가능액이에요.
          </div>
        </div>

        <div style={helpBlock}>
          <div style={helpHead}>필요자금에 뭐가 들어가나요?</div>
          <div style={helpBody}>
            집값에서 대출을 뺀 금액에 <b>취득세·지방교육세·농어촌특별세(85㎡ 초과)
            ·중개보수·등기비</b>를 더한 값이에요. 평형 카드의 &ldquo;부대비용 내역&rdquo;을
            누르면 항목별로 볼 수 있어요.<br />
            <span style={{ color: C.sub }}>
              등기·채권비는 채권 시세에 따라 변해 근사치예요.
            </span>
          </div>
        </div>

        <div style={helpBlock}>
          <div style={helpHead}>월 상환액과 DSR%가 왜 다른가요?</div>
          <div style={helpBody}>
            <b>월 상환액</b>은 실제 대출금리로 계산한, 매달 실제로 나가는 돈이에요.<br />
            <b>DSR%</b>는 은행 심사 기준이라 실제 금리에 <b>스트레스 금리</b>
            (규제지역 +3.0%p)를 더해 계산해요.<br />
            <span style={{ color: C.sub }}>
              같은 대출인데 DSR 쪽 숫자가 더 크게 나오는 게 정상이고, 한도는 이 기준으로 잘려요.
            </span>
          </div>
        </div>

        <div style={{ fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
          근거: 10.15 대책(2025-10-16 시행) + 스트레스 DSR 3단계. 실제 한도는 은행·신용·DTI 등에
          따라 달라질 수 있으며, 참고용 추정치예요.
        </div>
      </div>
    </div>
  );
}
