const YEARS = Array.from({ length: 18 }, (_, index) => 2009 + index);
const questionCache = new Map();
const selectionInput = document.querySelector('#selection');
const paper = document.querySelector('#paper');
const errorMessage = document.querySelector('#error-message');
const printButton = document.querySelector('#print-paper');
const questionBank = new Map();

function parseSelection(input) {
  const result = [];
  const seen = new Set();
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error('请输入至少一行年份和题号。');
  for (const line of lines) {
    const parts = line.replace(/[，,]/g, ' ').split(/\s+/).filter(Boolean);
    const yearToken = parts.shift() ?? '';
    const year = Number(yearToken);
    if (!/^\d{4}$/.test(yearToken) || !YEARS.includes(year)) {
      throw new Error(`年份无效：“${yearToken}”。支持 2009–2026。`);
    }
    if (!parts.length) throw new Error(`${year} 行没有题号。`);
    for (const token of parts) {
      if (!/^\d{1,2}$/.test(token)) throw new Error(`题号必须是 1–40 的数字：“${token}”。`);
      const number = Number(token);
      if (number < 1 || number > 40) throw new Error(`题号 ${number} 不在选择题范围 1–40 内。`);
      const key = `${year}-${number}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ year, number });
      }
    }
  }
  return result;
}

function encodeSelection(selection) {
  const masks = new Map();
  for (const { year, number } of selection) masks.set(year, (masks.get(year) ?? 0n) | (1n << BigInt(number - 1)));
  return [...masks].sort(([a], [b]) => a - b).map(([year, mask]) => `${year}=${mask.toString(16).padStart(10, '0')}`).join('.');
}

function decodeSelection(value) {
  const selection = [];
  for (const group of value.split('.')) {
    const match = group.match(/^(20\d{2})=([0-9a-f]{1,10})$/i);
    if (!match) throw new Error('分享链接中的题目编号格式无效。');
    const year = Number(match[1]);
    if (!YEARS.includes(year)) throw new Error(`分享链接包含不支持的年份 ${year}。`);
    const mask = BigInt(`0x${match[2]}`);
    if (mask >> 40n) throw new Error('分享链接包含超出 1–40 范围的题号。');
    for (let number = 1; number <= 40; number += 1) {
      if (mask & (1n << BigInt(number - 1))) selection.push({ year, number });
    }
  }
  if (!selection.length) throw new Error('分享链接没有选中题目。');
  return selection;
}

function selectionToInput(selection) {
  const grouped = new Map();
  for (const { year, number } of selection) {
    if (!grouped.has(year)) grouped.set(year, []);
    grouped.get(year).push(number);
  }
  return [...grouped].map(([year, numbers]) => `${year} ${[...new Set(numbers)].join(',')}`).join('\n');
}

async function loadYear(year) {
  if (!questionCache.has(year)) {
    const response = await fetch(new URL(`data/questions/${year}.json`, document.baseURI));
    if (!response.ok) throw new Error(`载入 ${year} 年题库失败（HTTP ${response.status}）。`);
    const questions = (await response.json()).filter((question) => question.number <= 40);
    questionCache.set(year, questions);
    for (const question of questions) questionBank.set(`${year}-${question.number}`, question);
  }
  return questionCache.get(year);
}

function textNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function renderQuestion(question) {
  const article = document.createElement('article');
  article.className = 'question';
  const heading = document.createElement('div');
  heading.className = 'question-heading';
  heading.append(textNode('span', 'question-id', `${question.year} · ${String(question.number).padStart(2, '0')}`));
  heading.append(textNode('span', 'question-type', '单项选择题'));
  const body = textNode('div', 'question-body', question.text);
  if (question.sourceImage) {
    const image = document.createElement('img');
    image.src = new URL(question.sourceImage, document.baseURI).href;
    image.alt = `${question.year} 年第 ${question.number} 题原卷图表，来源 PDF 第 ${question.sourcePage} 页`;
    image.loading = 'eager';
    body.append(image);
  } else if (question.verification === 'image-or-table-needs-review') {
    body.append(textNode('p', 'review-note', '原卷页图尚未匹配；当前显示文字版，需人工复核。'));
  }
  article.append(heading, body);
  return article;
}

function createAiPrompt(selection) {
  const ids = selection.map(({ year, number }) => `${year}-${String(number).padStart(2, '0')}`);
  return `请识别我附上的计算机 408 真题图片，只处理以下题号：${ids.join('、')}。\n\n要求：\n1. 按原卷逐字转录题干、代码、公式、表格和所有选项；图表请描述关键节点、连线、数值、坐标或表格单元。\n2. 不要补写答案或解析，不确定处写 [待核对]，不要猜测。\n3. 严格输出 JSON 数组，每项格式如下：\n{"year":2022,"number":1,"type":"single","question":"题干","code":null,"options":["A. ...","B. ...","C. ...","D. ..."],"figure_description":null,"uncertain_spans":[]}\n4. 综合题以完整题干和各小问记录，options 设为 []。\n5. 输出中不得包含未请求的题目。`;
}

function updateShareUrl(selection) {
  const url = new URL(window.location.href);
  url.searchParams.delete('q');
  url.searchParams.set('s', encodeSelection(selection));
  history.replaceState(null, '', url);
}

async function buildPaper() {
  errorMessage.hidden = true;
  errorMessage.textContent = '';
  try {
    const selection = parseSelection(selectionInput.value);
    const years = [...new Set(selection.map(({ year }) => year))];
    await Promise.all(years.map(loadYear));
    const selected = selection.map(({ year, number }) => {
      const question = questionBank.get(`${year}-${number}`);
      if (!question) throw new Error(`题库缺少 ${year} 年第 ${number} 题。`);
      return question;
    });

    paper.replaceChildren();
    const title = document.createElement('header');
    title.className = 'paper-title';
    title.append(textNode('h2', '', '计算机 408 选择题试卷'));
    title.append(textNode('p', '', `${years.join('、')} 年 · 共 ${selected.length} 题`));
    paper.append(title);
    for (const question of selected) paper.append(renderQuestion(question));
    document.querySelector('#selection-count').textContent = `已选 ${selected.length} 题 · ${years.length} 个年份`;
    document.querySelector('#ai-prompt').value = createAiPrompt(selection);
    printButton.disabled = false;
    updateShareUrl(selection);
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
}

async function copyText(text, button, successText) {
  try {
    await navigator.clipboard.writeText(text);
    const label = button.textContent;
    button.textContent = successText;
    window.setTimeout(() => { button.textContent = label; }, 1500);
  } catch {
    errorMessage.textContent = '浏览器未允许复制。请手动选择文本复制。';
    errorMessage.hidden = false;
  }
}

async function downloadPdf() {
  const images = [...paper.querySelectorAll('img')];
  await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
  window.print();
}

document.querySelector('#build-paper').addEventListener('click', buildPaper);
printButton.addEventListener('click', downloadPdf);
document.querySelector('#copy-ai-prompt').addEventListener('click', () => {
  copyText(document.querySelector('#ai-prompt').value, document.querySelector('#copy-ai-prompt'), '已复制');
});
document.querySelector('#copy-link').addEventListener('click', () => {
  try {
    const selection = parseSelection(selectionInput.value);
    const url = new URL(window.location.href);
    url.searchParams.delete('q');
    url.searchParams.set('s', encodeSelection(selection));
    copyText(url.toString(), document.querySelector('#copy-link'), '已复制');
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
});

document.querySelector('#selection').addEventListener('input', () => {
  document.querySelector('#ai-prompt').value = '';
  printButton.disabled = true;
});

document.querySelector('#ai-prompt').value = createAiPrompt([]);
(async function initialize() {
  try {
    const response = await fetch(new URL('data/bank-meta.json', document.baseURI));
    if (!response.ok) throw new Error('题库统计载入失败。');
    const metadata = await response.json();
    document.querySelector('#bank-count').textContent = `${metadata.questions} 道单选题 · ${metadata.years[0]}–${metadata.years.at(-1)}`;
    const url = new URL(window.location.href);
    const packed = url.searchParams.get('s');
    if (packed) selectionInput.value = selectionToInput(decodeSelection(packed));
    else if (url.searchParams.has('q')) {
      const legacy = parseSelection(url.searchParams.get('q').replace(/;/g, '\n').replace(/:/g, ' '));
      selectionInput.value = selectionToInput(legacy);
    }
    await buildPaper();
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
})();
