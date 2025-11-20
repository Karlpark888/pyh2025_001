const fileConfig = [
  { inputId: "productMasterInput", nameId: "productMasterName", key: "master" },
  { inputId: "inventoryInput", nameId: "inventoryName", key: "inventory" },
  { inputId: "pastSalesInput", nameId: "pastSalesName", key: "pastSales" },
  { inputId: "futurePlanInput", nameId: "futurePlanName", key: "futurePlan" },
];

const REQUIRED_COLUMNS = {
  master: ["제품코드", "제품명", "제품유형", "담당", "안전재고"],
  inventory: ["제품코드", "현재고", "입고예정수량", "입고예정일"],
  pastSales: ["제품코드", "월", "판매수량"],
  futurePlan: ["제품코드", "월", "계획수량"],
};

document.addEventListener("DOMContentLoaded", () => {
  const generateReportButton = document.getElementById("generateReportButton");
  const resultContainer = document.getElementById("resultContainer");
  const summaryContainer = document.getElementById("summary");
  const detailedReportContainer = document.getElementById("detailedReport");

  fileConfig.forEach(({ inputId, nameId }) => {
    const input = document.getElementById(inputId);
    const nameField = document.getElementById(nameId);
    input.addEventListener("change", () => {
      if (input.files && input.files.length > 0) {
        nameField.textContent = input.files[0].name;
      } else {
        nameField.textContent = "업로드된 파일 없음";
      }
    });
  });

  generateReportButton.addEventListener("click", async () => {
    try {
      const fileChecks = fileConfig.map(({ inputId, key }) => {
        const input = document.getElementById(inputId);
        if (!input.files || input.files.length === 0) {
          throw new Error("모든 파일을 업로드한 후 다시 시도해주세요.");
        }
        return readCsvFile(input.files[0], key);
      });

      const [masterData, inventoryData, pastSalesData, futurePlanData] = await Promise.all(fileChecks);
      const analysis = buildAnalysis(masterData, inventoryData, pastSalesData, futurePlanData);
      renderAnalysis(analysis, summaryContainer, detailedReportContainer, resultContainer);
    } catch (error) {
      alert(error.message || "리포트 생성 중 오류가 발생했습니다.");
      console.error(error);
    }
  });
});

async function readCsvFile(file, dataKey) {
  const text = await file.text();
  const parsed = parseCSV(text);
  validateColumns(parsed.headers, REQUIRED_COLUMNS[dataKey], file.name);
  return parsed.rows;
}

function parseCSV(text) {
  const sanitized = text.replace(/\ufeff/g, "").trim();
  if (!sanitized) {
    return { headers: [], rows: [] };
  }

  const lines = sanitized.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = splitCSVRow(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const values = splitCSVRow(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}

function splitCSVRow(row) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function validateColumns(headers, requiredColumns, fileName) {
  const missing = requiredColumns.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`${fileName} 파일에 필수 칼럼(${missing.join(", ")})이 없습니다.`);
  }
}

function buildAnalysis(masterRows, inventoryRows, pastSalesRows, futurePlanRows) {
  const masterMap = new Map();
  masterRows.forEach((row) => {
    if (row["제품코드"]) {
      masterMap.set(row["제품코드"], row);
    }
  });

  const inventoryMap = new Map();
  inventoryRows.forEach((row) => {
    const code = row["제품코드"];
    if (!code) return;
    const currentStock = parseNumber(row["현재고"]);
    const incomingQty = parseNumber(row["입고예정수량"]);
    const inboundDate = parseDateKey(row["입고예정일"]);

    if (!inventoryMap.has(code)) {
      inventoryMap.set(code, {
        currentStock: Number.isFinite(currentStock) ? currentStock : 0,
        incomingTotal: 0,
        incomingSchedule: [],
      });
    }

    const record = inventoryMap.get(code);
    if (Number.isFinite(currentStock) && currentStock > 0) {
      record.currentStock = currentStock;
    }

    if (Number.isFinite(incomingQty) && incomingQty > 0) {
      record.incomingTotal += incomingQty;
      if (inboundDate) {
        record.incomingSchedule.push({ dateKey: inboundDate, qty: incomingQty });
      }
    }
  });

  const pastSalesMap = new Map();
  pastSalesRows.forEach((row) => {
    const code = row["제품코드"];
    if (!code) return;
    const month = parseMonthKey(row["월"]);
    const qty = parseNumber(row["판매수량"]);
    if (!month || !Number.isFinite(qty)) return;

    if (!pastSalesMap.has(code)) {
      pastSalesMap.set(code, { total: 0, months: [] });
    }
    const record = pastSalesMap.get(code);
    record.total += qty;
    record.months.push({ monthKey: month, qty });
  });

  const futurePlanMap = new Map();
  futurePlanRows.forEach((row) => {
    const code = row["제품코드"];
    if (!code) return;
    const month = parseMonthKey(row["월"]);
    const qty = parseNumber(row["계획수량"]);
    if (!month || !Number.isFinite(qty)) return;

    if (!futurePlanMap.has(code)) {
      futurePlanMap.set(code, { total: 0, months: [] });
    }
    const record = futurePlanMap.get(code);
    record.total += qty;
    record.months.push({ monthKey: month, qty });
  });

  const productCodes = new Set([
    ...masterMap.keys(),
    ...inventoryMap.keys(),
    ...pastSalesMap.keys(),
    ...futurePlanMap.keys(),
  ]);

  const productReports = [];
  const summaryStats = { success: 0, warning: 0, danger: 0 };

  productCodes.forEach((code) => {
    const master = masterMap.get(code) ?? {};
    const inventory = inventoryMap.get(code) ?? {
      currentStock: 0,
      incomingTotal: 0,
      incomingSchedule: [],
    };

    const past = pastSalesMap.get(code) ?? { total: 0, months: [] };
    const future = futurePlanMap.get(code) ?? { total: 0, months: [] };

    past.months.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    future.months.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    inventory.incomingSchedule.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    const avgSales = past.months.length ? past.total / past.months.length : 0;
    const coverage = avgSales > 0 ? inventory.currentStock / avgSales : null;
    const earliestInbound = inventory.incomingSchedule[0] ?? null;
    const earliestInboundQty = earliestInbound ? earliestInbound.qty : 0;
    const latestSales = past.months[past.months.length - 1] ?? null;
    const firstSales = past.months[0] ?? null;
    const salesTrendDelta = latestSales && firstSales ? latestSales.qty - firstSales.qty : 0;
    const nextPlan = future.months[0] ?? null;
    const projectedGap = (inventory.currentStock + earliestInboundQty) - (nextPlan ? nextPlan.qty : 0);

    const planVsHistoryRatio = avgSales > 0 && future.total > 0
      ? future.total / (avgSales * Math.max(1, future.months.length))
      : null;

    let statusClass = "success";
    let statusText = "재고/입고로 계획 충족 가능";

    if (projectedGap < 0) {
      statusClass = "danger";
      statusText = "공급 부족 가능성 (재고 + 최근 입고량이 계획 대비 부족)";
    } else if (coverage !== null && coverage < 1) {
      statusClass = "warning";
      statusText = "재고 커버리지 1개월 미만";
    } else if (!past.months.length || !future.months.length) {
      statusClass = "warning";
      statusText = "판매 실적 또는 계획 데이터가 부족";
    }

    summaryStats[statusClass] += 1;

    const insightParts = [];
    if (avgSales > 0) {
      insightParts.push(`최근 6개월 월평균 판매 ${formatNumber(avgSales, 1)} EA, 재고 커버리지 ${coverage !== null ? formatNumber(coverage, 1) + "개월" : "N/A"}`);
    } else {
      insightParts.push("판매 실적 데이터가 부족하여 커버리지를 계산할 수 없습니다.");
    }

    if (nextPlan) {
      insightParts.push(`다음 계획(${formatMonth(nextPlan.monthKey)}) ${formatNumber(nextPlan.qty)} EA 대비 재고/입고 잔여 ${formatNumber(projectedGap)} EA`);
    } else {
      insightParts.push("향후 계획 데이터가 부족합니다.");
    }

    if (planVsHistoryRatio !== null) {
      insightParts.push(`계획 대비 실적 비율 ${formatPercentage(planVsHistoryRatio)} (1.0 이상이면 계획이 실적 평균보다 높음)`);
    }

    if (salesTrendDelta !== 0) {
      const trendWord = salesTrendDelta > 0 ? "증가" : "감소";
      insightParts.push(`실적 추세: ${firstSales ? formatMonth(firstSales.monthKey) : "-"} 대비 ${latestSales ? formatMonth(latestSales.monthKey) : "-"} ${trendWord} ${formatNumber(Math.abs(salesTrendDelta))} EA`);
    }

    const productReport = {
      code,
      name: master["제품명"] ?? "제품명 미등록",
      statusClass,
      statusText,
      meta: [
        master["제품유형"] ? `유형: ${master["제품유형"]}` : null,
        master["담당"] ? `담당: ${master["담당"]}` : null,
        master["안전재고"] ? `안전재고: ${master["안전재고"]}` : null,
        inventory.currentStock ? `현재고: ${formatNumber(inventory.currentStock)}` : null,
      ].filter(Boolean),
      metrics: {
        currentStock: inventory.currentStock,
        incomingTotal: inventory.incomingTotal,
        earliestInboundDate: earliestInbound ? earliestInbound.dateKey : null,
        earliestInboundQty,
        pastTotal: past.total,
        avgSales,
        futureTotal: future.total,
        nextPlan,
        projectedGap,
      },
      insight: insightParts.join(" · "),
    };

    productReports.push(productReport);
  });

  productReports.sort((a, b) => a.code.localeCompare(b.code));

  return { productReports, summaryStats };
}

function renderAnalysis(analysis, summaryContainer, detailedContainer, resultContainer) {
  const { productReports, summaryStats } = analysis;

  if (!productReports.length) {
    summaryContainer.innerHTML = "<p>분석 가능한 제품이 없습니다. 업로드한 데이터의 제품코드가 일치하는지 확인하세요.</p>";
    detailedContainer.innerHTML = "";
    resultContainer.classList.remove("hidden");
    return;
  }

  const chips = [];
  chips.push(`<span class="chip">총 ${productReports.length}개 제품 분석</span>`);
  if (summaryStats.success) chips.push(`<span class="chip success">안정 ${summaryStats.success}개</span>`);
  if (summaryStats.warning) chips.push(`<span class="chip warning">주의 ${summaryStats.warning}개</span>`);
  if (summaryStats.danger) chips.push(`<span class="chip danger">공급부족 ${summaryStats.danger}개</span>`);
  summaryContainer.innerHTML = chips.join("\n");

  detailedContainer.innerHTML = productReports
    .map((product) => {
      const {
        code,
        name,
        statusClass,
        statusText,
        meta,
        metrics: {
          currentStock,
          incomingTotal,
          earliestInboundDate,
          earliestInboundQty,
          pastTotal,
          avgSales,
          futureTotal,
          nextPlan,
          projectedGap,
        },
        insight,
      } = product;

      const metaHtml = meta.length ? `<div class="meta">${meta.map((item) => `<span>${item}</span>`).join("")}</div>` : "";

      const tableRows = [
        ["현재고", formatNumber(currentStock)],
        ["향후 입고 합계", formatNumber(incomingTotal)],
        ["다음 입고 일정", earliestInboundDate ? `${formatDate(earliestInboundDate)} (${formatNumber(earliestInboundQty)} EA)` : "-"],
        ["최근 6개월 판매 합계", formatNumber(pastTotal)],
        ["최근 6개월 월평균", formatNumber(avgSales, 1)],
        ["향후 6개월 계획 합계", formatNumber(futureTotal)],
        ["다음달 계획", nextPlan ? `${formatMonth(nextPlan.monthKey)} / ${formatNumber(nextPlan.qty)} EA` : "-"],
        ["재고/입고 대비 다음달 잔여", formatNumber(projectedGap)],
      ]
        .map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`)
        .join("");

      return `
        <article class="product-report ${statusClass}">
          <h3>${name} <small>(${code})</small></h3>
          <p class="status ${statusClass}">${statusText}</p>
          ${metaHtml}
          <table>${tableRows}</table>
          <p class="insight">${insight}</p>
        </article>
      `;
    })
    .join("\n");

  resultContainer.classList.remove("hidden");
}

function parseNumber(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[,\s]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseDateKey(value) {
  if (!value) return null;
  const normalized = value.replace(/\./g, "-").trim();
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseMonthKey(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  const match = trimmed.match(/^(\d{4})[-/.]?(\d{2})$/);
  if (match) {
    const [, year, month] = match;
    return `${year}-${month}`;
  }

  const compactMatch = trimmed.match(/^(\d{4})(\d{2})$/);
  if (compactMatch) {
    const [, year, month] = compactMatch;
    return `${year}-${month}`;
  }

  return null;
}

function formatNumber(value, fractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value).toLocaleString("ko-KR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatPercentage(value) {
  return `${(value * 100).toFixed(0)}%`;
}

function formatMonth(monthKey) {
  if (!monthKey) return "-";
  const [year, month] = monthKey.split("-");
  return `${year}.${month}`;
}

function formatDate(dateKey) {
  if (!dateKey) return "-";
  const [year, month, day] = dateKey.split("-");
  return `${year}.${month}.${day}`;
}
