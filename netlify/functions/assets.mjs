import { GoogleAuth } from 'google-auth-library';
import { parseSheets } from './lib/data.mjs';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
export default async function handler(request) {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const id = process.env.GOOGLE_SPREADSHEET_ID;
    if (!raw || !id) return Response.json({ error: 'Netlify 환경 변수 두 개와 Functions 적용 범위를 확인해 주세요.' }, { status: 503, headers });
    let credentials;
    try {
      credentials = JSON.parse(raw);
      if (credentials.type !== 'service_account' || !credentials.client_email || !credentials.private_key) throw new Error();
    } catch {
      return Response.json({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON에 올바른 서비스 계정 JSON 전체를 등록해 주세요.' }, { status: 503, headers });
    }
    const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    const client = await auth.getClient();
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values:batchGet`);
    for (const range of ["'자산현황'!A1:F5000", "'투자 종목'!A1:L5000", "'월별 자산 추이'!A1:F5000"]) url.searchParams.append('ranges', range);
    url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE');
    const result = await client.request({ url: url.toString(), timeout: 15000, retry: false });
    return Response.json(parseSheets(result.data.valueRanges), { headers });
  } catch (error) {
    // Log only status codes; Google errors may contain credentials or sheet contents.
    const status = error.response?.status;
    console.error('Sheet read failed', { status: status ?? 'unknown' });
    const message = status === 403 ? '시트 뷰어 공유와 Google Sheets API 활성화 상태를 확인해 주세요.'
      : status === 404 ? '스프레드시트 ID와 서비스 계정의 시트 접근 권한을 확인해 주세요.'
      : '시트 데이터를 불러오지 못했습니다. 인증 설정, 탭 이름과 셀의 수식 오류를 확인해 주세요.';
    return Response.json({ error: message }, { status: 502, headers });
  }
}
