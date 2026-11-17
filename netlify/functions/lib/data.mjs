function number(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('시트에 숫자가 아닌 값 또는 수식 오류가 있습니다.');
  }
  return value;
}

export function parseSheets(valueRanges) {
  const [assetRange, investmentRange, monthlyRange] = valueRanges;
  const assets = assetRange?.values ?? [];
  const investments = investmentRange?.values ?? [];
  const months = monthlyRange?.values ?? [];
  const assetHeader = assets.findIndex(row => row[0] === '자산분류');
  const debtHeader = assets.findIndex(row => row[0] === '부채분류');
  const holdingHeader = investments.findIndex(row => row[0] === '종목코드/티커');
  const monthHeader = months.findIndex(row => row[0] === '기준월');
  if ([assetHeader, debtHeader, holdingHeader, monthHeader].some(i => i < 0)) {
    throw new Error('시트의 필수 열 제목을 찾을 수 없습니다.');
  }
  const items = assets.slice(assetHeader + 1, debtHeader)
    .filter(row => row[1] && row[2])
    .map(([cat, name, bank, amount, , liquidity]) => {
      if (!['유동자산', '비유동자산'].includes(liquidity)) throw new Error('유동성 분류를 확인해 주세요.');
      return [String(cat), String(name), String(bank), number(amount), liquidity === '유동자산'];
    });
  if (!items.length) throw new Error('자산 항목이 없습니다.');
  const debts = assets.slice(debtHeader + 1).filter(row => row[1] && row[2])
    .map(([cat, name, bank, amount]) => [String(cat), String(name), String(bank), number(amount)]);
  const total = items.reduce((sum, row) => sum + row[3], 0);
  const debt = debts.reduce((sum, row) => sum + row[3], 0);
  const groups = new Map();
  for (const [cat, , , amount] of items) groups.set(cat, (groups.get(cat) ?? 0) + amount);
  const liquid = items.filter(row => row[4]).reduce((sum, row) => sum + row[3], 0);
  const holdings = investments.slice(holdingHeader + 1).filter(row => row[0] && row[1])
    .map(row => {
      if (!['KRW', 'USD'].includes(row[2])) throw new Error('지원하지 않는 투자 통화입니다.');
      return [String(row[0]), String(row[1]), row[2], number(row[3]), number(row[4]), number(row[5]), number(row[9]) * 100, number(row[10])];
    });
  const summary = label => number(investments.find(row => row[0] === label)?.[1]);
  const value = summary('총 평가금액(원)');
  const cost = summary('총 매수금액(원)');
  const usdRow = investments.findIndex(row => row.includes('USD/KRW'));
  const usdColumn = investments[usdRow]?.indexOf('USD/KRW');
  const usdkrw = number(investments[usdRow + 1]?.[usdColumn]);
  const monthly = months.slice(monthHeader + 1).filter(row => row[0] && row[1] !== null && row[1] !== undefined && row[1] !== '')
    .map(row => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row[0])) throw new Error('기준월 형식을 확인해 주세요.');
      return [row[0], number(row[1]), row[2] === '-' || row[2] == null || row[2] === '' ? null : number(row[2]), number(row[4]), number(row[5])];
    }).sort((a, b) => a[0].localeCompare(b[0]));
  return {
    fetchedAt: new Date().toISOString(), total, debt, net: total - debt,
    composition: [...groups], liquidity: { liquid, illiquid: total - liquid }, items, debts,
    invest: { cost, value, pl: value - cost, ret: cost === 0 ? 0 : (value - cost) / cost * 100,
      domestic: holdings.filter(row => row[2] === 'KRW').reduce((sum, row) => sum + row[7], 0),
      overseas: holdings.filter(row => row[2] === 'USD').reduce((sum, row) => sum + row[7], 0), usdkrw, holdings },
    monthly,
  };
}
