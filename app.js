const YEARS = Array.from({ length: 18 }, (_, index) => 2009 + index);
const questionCache = new Map();
const selectionInput = document.querySelector('#selection');
const paper = document.querySelector('#paper');
const errorMessage = document.querySelector('#error-message');
const printButton = document.querySelector('#print-paper');

function parseSelection(input) {
  const result = [];
  const seen = new Set();
  const clauses = input.split(';').map((part) => part.trim());
  if (clauses.some((part) => !part)) throw new Error('语法错误：请用分号分隔年份，且每段都要填写。');

  for (const clause of clauses) {
    const match = clause.match(/^(\d{4})\s*:\s*(.+)$/);
    if (!match) throw new Error(`语法错误：无法解析“${clause}”。示例：2022:1-5,11,41-42`);
    const year = Number(match[1]);
    if (!YEARS.includes(year)) throw new Error(`年份 ${year} 不在题库范围（2009–2026）。`);
    const spec = match[2].trim();
    const numbers = new Set();
    if (spec.toLowerCase() === 'all') {
      for (let number = 1; number <= 47; number += 1) numbers.add(number);
    } else {
      for (const token of spec.split(',').map((part) => part.trim())) {
        const range = token.match(/^(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/);
        if (!range) throw new Error(`题号格式错误：“${token}”。使用单题或连续范围，例如 1,3-5。`);
        const first = Number(range[1]);
        const last = Number(range[2] ?? range[1]);
        if (first < 1 || last > 47 || first > last) throw new Error(`题号范围无效：“${token}”。每年题号为 1–47。`);
        for (let number = first; number <= last; number += 1) numbers.add(number);
      }
    }
    for (const number of numbers) {
      const key = `${year}-${number}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ year, number });
      }
    }
  }
  return result;
}

async function loadYear(year) {
  if (!questionCache.has(year)) {
    const response = await fetch(new URL(`data/questions/${year}.json`, document.baseURI));
    if (!response.ok) throw new Error(`载入 ${year} 年题库失败（HTTP ${response.status}）。`);
    questionCache.set(year, response.json());
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
  heading.append(textNode('span', 'question-type', question.type === 'single' ? '单项选择题' : '综合应用题'));
  const body = textNode('div', 'question-body', question.text);
  if (question.verification === 'image-or-table-needs-review') {
    body.append(textNode('p', 'review-note', '含图或表格，文字版未包含完整图表；请对照原始试卷。'));
  }
  if (question.image) {
    const img = document.createElement('img');
    img.src = question.image;
    img.alt = `${question.year} 年第 ${question.number} 题原图`;
    img.loading = 'lazy';
    body.append(img);
  }
  article.append(heading, body);
  return article;
}

async function buildPaper() {
  errorMessage.hidden = true;
  errorMessage.textContent = '';
  try {
    const selection = parseSelection(selectionInput.value);
    const years = [...new Set(selection.map(({ year }) => year))];
    const banks = new Map(await Promise.all(years.map(async (year) => [year, await loadYear(year)])));
    const selected = selection.map(({ year, number }) => {
      const question = banks.get(year).find((item) => item.number === number);
      if (!question) throw new Error(`题库缺少 ${year} 年第 ${number} 题。`);
      return question;
    });

    paper.replaceChildren();
    const title = document.createElement('header');
    title.className = 'paper-title';
    title.append(textNode('h2', '', '计算机 408 自定义试卷'));
    title.append(textNode('p', '', `${years.join('、')} 年 · 共 ${selected.length} 题`));
    paper.append(title);
    for (const question of selected) paper.append(renderQuestion(question));
    document.querySelector('#selection-count').textContent = `已选 ${selected.length} 题 · ${years.length} 个年份`;
    printButton.disabled = false;
    const url = new URL(window.location.href);
    url.searchParams.set('q', selectionInput.value.trim());
    history.replaceState(null, '', url);
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
}

async function printWhenReady() {
  const images = [...paper.querySelectorAll('img')];
  await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
  window.print();
}
document.querySelector('#build-paper').addEventListener('click', buildPaper);
printButton.addEventListener('click', printWhenReady);
document.querySelector('#copy-link').addEventListener('click', async () => {
  const url = new URL(window.location.href);
  url.searchParams.set('q', selectionInput.value.trim());
  try {
    await navigator.clipboard.writeText(url.toString());
    document.querySelector('#copy-link').textContent = '已复制';
    window.setTimeout(() => { document.querySelector('#copy-link').textContent = '複'; }, 1400);
  } catch {
    errorMessage.textContent = '浏览器未允许复制链接。可从地址栏复制当前页面地址。';
    errorMessage.hidden = false;
  }
});

(async function initialize() {
  try {
    const response = await fetch(new URL('data/bank-meta.json', document.baseURI));
    if (!response.ok) throw new Error('题库统计载入失败。');
    const metadata = await response.json();
    document.querySelector('#bank-count').textContent = `${metadata.questions} 道题 · ${metadata.years[0]}–${metadata.years.at(-1)}`;
    const initial = new URL(window.location.href).searchParams.get('q');
    if (initial) selectionInput.value = initial;
    await buildPaper();
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
})();
