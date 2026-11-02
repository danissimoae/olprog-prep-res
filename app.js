/* OlProg Prep: клиентское приложение. Сборки нет, всё на чистом JS.
 *
 * Разделы файла:
 *   1. Константы и состояние
 *   2. Прогресс (localStorage, экспорт и импорт)
 *   3. Каталог задач и отрисовка списков
 *   4. Страница задачи (условие, переключение между задачами)
 *   5. Редактор: шаблоны, подсветка, сохранение кода
 *   6. События и запуск
 */

/* ============ 1. Константы и состояние ============ */

const STORAGE_KEY = 'olprog';
const LANGUAGE_KEY = 'olprog-lang';

const $ = (selector) => document.querySelector(selector);

const state = {
    topics: [],            // [{id, title, problems: [...]}] в порядке index.json
    problems: {},          // id -> задача (+ topic, topicTitle)
    order: [],             // id всех задач подряд: нужен для «Следующая»
    progress: {},          // id -> { solved: bool, code: { язык: текст } }
    current: null,         // открытая задача
    language: localStorage.getItem(LANGUAGE_KEY) || 'cpp',
    todayCount: 0,         // решено сегодня на прошлом обновлении
    flameLevel: 0,         // предыдущий уровень огонька: нужен для вспышки
    sentToCses: false,     // нажали «Отправить», ждём возвращения на вкладку
};

// Шаблоны, которые подставляются в пустой редактор.
const TEMPLATES = {
    cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`,
    python: `import sys
input = sys.stdin.readline

`,
    java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);

    }
}
`,
    csharp: `using System;

class Program {
    static void Main() {

    }
}
`,
};

const FILE_EXTENSIONS = { cpp: 'cpp', python: 'py', java: 'java', csharp: 'cs' };

// Огонёк: пороги «решено сегодня» для уровней 1..5 (уровень 0: огонь не горит).
const FLAME_THRESHOLDS = [1, 2, 3, 5, 7];

const PHRASES = [
    'Движешься к прайму?',
    'Не забывай про свою главную цель, продолжай.',
    'Ещё одна задача: ещё один шаг.',
    'Регулярность важнее вдохновения.',
    'Каждый Wrong Answer приближает к Accepted.',
    'Сложная задача — это просто задача, которую ты ещё не решил.',
    'Сначала медленно, потом быстро.',
    'Сегодняшний разбор — завтрашняя интуиция.',
    'Не торопись: верный ответ лучше быстрого.',
    'Проверь граничные случаи: n = 1, переполнение, пустой ввод.',
    'Огонь держится на привычке.',
    'Через месяц это будет казаться лёгким.',
    'Баг сегодня — опыт завтра.',
    'Хороший код пишется постепенно.',
    'Один Accepted в день — и день прожит не зря.',
    'Застрял? Нарисуй пример на бумаге.',
];

const escapeHtml = (text) =>
    String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('on');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('on'), 2000);
}

/* ============ 2. Прогресс ============ */

function loadProgress() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
        return {}; // испорченные данные не должны ломать сайт
    }
}

function saveProgress() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
    } catch {
        showToast('Не удалось сохранить: память браузера недоступна');
    }
}

const entryFor = (id) => (state.progress[id] ??= {});
const isSolved = (id) => Boolean(state.progress[id]?.solved);

const todayKey = () => new Date().toLocaleDateString('sv'); // локальная дата, ГГГГ-ММ-ДД

function setSolved(id, solved) {
    const entry = entryFor(id);
    if (solved && !entry.solved) entry.solvedAt = todayKey(); // считаем только новые решения
    if (!solved) delete entry.solvedAt;
    entry.solved = solved;
    saveProgress();
    refreshProgress();
}

function exportProgress() {
    const blob = new Blob([JSON.stringify(state.progress, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'olprog-progress.json';
    link.click();
    URL.revokeObjectURL(link.href);
}

async function importProgress(file) {
    try {
        const data = JSON.parse(await file.text());
        if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('format');
        if (!confirm('Заменить текущий прогресс и решения данными из файла?')) return;
        state.progress = data;
        state.todayCount = solvedToday();                  // импорт не должен вызывать молнии
        saveProgress();
        refreshProgress();
        showToast('Прогресс загружен');
    } catch {
        showToast('Не удалось прочитать файл прогресса');
    }
}

/* ---- Огонёк ---- */

const solvedToday = () =>
    Object.values(state.progress).filter((e) => e.solved && e.solvedAt === todayKey()).length;

function pickPhrase() {
    $('#streak-phrase').textContent = PHRASES[Math.floor(Math.random() * PHRASES.length)];
}

function updateStreak() {
    const count = solvedToday();
    const level = FLAME_THRESHOLDS.filter((limit) => count >= limit).length;
    const streak = $('#streak');

    if (level > state.flameLevel) {                       // уровень вырос: короткая вспышка
        streak.classList.remove('pop');
        void streak.offsetWidth;                            // перезапуск CSS-анимации
        streak.classList.add('pop');
    }
    state.flameLevel = level;

    if (count > state.todayCount) zap(level);             // решили новую задачу: молнии
    state.todayCount = count;

    streak.dataset.level = level;
    streak.title = `Огонь: уровень ${level} из 5`;
    $('#streak-count').textContent = `Решено сегодня: ${count}`;
}

/* ---- Молнии: вспышка при каждой новой решённой задаче ---- */

// Чем выше уровень огня, тем больше молний, ветвей и свечения.
const BOLT_LEVELS = [
    { bolts: 1, branch: 0.08, width: 1.2, duration: 700 },
    { bolts: 2, branch: 0.12, width: 1.4, duration: 800 },
    { bolts: 3, branch: 0.18, width: 1.7, duration: 900 },
    { bolts: 4, branch: 0.25, width: 2.0, duration: 1000 },
    { bolts: 6, branch: 0.32, width: 2.4, duration: 1200 },
];

const rand = (min, max) => min + Math.random() * (max - min);

// Рваная линия: делим отрезок пополам, сдвигаем середину случайно и повторяем для половин.
function jaggedLine(a, b, spread, depth) {
    if (depth === 0) return [a, b];
    const mid = {
        x: (a.x + b.x) / 2 + rand(-spread, spread),
        y: (a.y + b.y) / 2 + rand(-spread, spread),
    };
    const left = jaggedLine(a, mid, spread / 1.9, depth - 1);
    const right = jaggedLine(mid, b, spread / 1.9, depth - 1);
    return left.concat(right.slice(1));
}

// Молния = главная линия + тонкие ветки, которые отходят от случайных точек.
function createBolt(start, end, params, width, isBranch = false) {
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const points = jaggedLine(start, end, length * 0.16, isBranch ? 4 : 6);
    const parts = [{ points, width }];
    if (isBranch) return parts;

    const direction = Math.atan2(end.y - start.y, end.x - start.x);
    points.forEach((point, i) => {
        if (i % 4 !== 0 || i > points.length - 8 || Math.random() > params.branch) return;
        const angle = direction + rand(-1, 1);
        const size = length * rand(0.12, 0.3);
        const tip = { x: point.x + Math.cos(angle) * size, y: point.y + Math.sin(angle) * size };
        parts.push(...createBolt(point, tip, params, width * 0.55, true));
    });
    return parts;
}

// Начало всегда на верхнем краю. На высоких уровнях часть молний бьёт из верхних углов,
// и они охватывают плашку с боков. Конец: внутри плашки.
function pickStart(box, size, level) {
    if (level >= 3 && Math.random() < 0.4) {
        const fromLeft = Math.random() < 0.5;
        return { x: fromLeft ? rand(0, size.w * 0.15) : rand(size.w * 0.85, size.w), y: 0 };
    }
    return { x: rand(size.w * 0.15, size.w * 0.85), y: 0 };
}

function pickEnd(box) {
    return {
        x: rand(box.left + 12, box.right - 12),
        y: rand(box.top + (box.bottom - box.top) * 0.35, box.bottom - 6),
    };
}

// Три прохода одной линии: широкое мягкое свечение, жёлтое тело, светлая сердцевина.
function drawBolt(ctx, parts, shown, alpha, level) {
    ctx.shadowColor = 'rgba(250, 204, 21, 0.9)';
    ctx.shadowBlur = 6 + level * 3;
    const passes = [
        [5, `rgba(245, 158, 11, ${0.18 * alpha})`],
        [2.4, `rgba(250, 204, 21, ${0.55 * alpha})`],
        [1, `rgba(255, 251, 224, ${alpha})`],
    ];
    for (const { points, width } of parts) {
        const visible = points.slice(0, Math.max(2, Math.floor(points.length * shown)));
        ctx.beginPath();
        visible.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        for (const [factor, color] of passes) {
            ctx.lineWidth = width * factor;
            ctx.strokeStyle = color;
            ctx.stroke();
        }
    }
}

// ---- конец чистых функций (ниже работа с DOM) ----

let zapToken = 0;

function zap(level) {
    const canvas = $('#zap');
    const streak = $('#streak');
    if (!canvas.getContext || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const params = BOLT_LEVELS[level - 1];
    const token = ++zapToken;                              // новая вспышка отменяет прежнюю

    // Холст больше плашки на --zx и --zy с каждой стороны: молнии выходят за её края.
    const css = getComputedStyle(streak);
    const pad = { x: parseFloat(css.getPropertyValue('--zx')), y: parseFloat(css.getPropertyValue('--zy')) };
    const size = { w: canvas.clientWidth, h: canvas.clientHeight };
    const box = { left: pad.x, right: size.w - pad.x, top: pad.y, bottom: size.h - pad.y };

    const ratio = window.devicePixelRatio || 1;
    canvas.width = size.w * ratio;
    canvas.height = size.h * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineCap = ctx.lineJoin = 'round';

    const bolts = Array.from({ length: params.bolts }, (_, i) => ({
        parts: createBolt(pickStart(box, size, level), pickEnd(box), params, params.width),
        delay: i * 90,                                       // молнии бьют по очереди
    }));

    streak.classList.add('zap');
    const startedAt = performance.now();

    function frame(now) {
        if (token !== zapToken) return;
        const elapsed = now - startedAt;
        ctx.clearRect(0, 0, size.w, size.h);
        if (elapsed >= params.duration) {
            streak.classList.remove('zap');
            return;
        }
        const fade = 1 - Math.max(0, (elapsed / params.duration - 0.5) / 0.5); // вторая половина: затухание
        for (const bolt of bolts) {
            const age = elapsed - bolt.delay;
            if (age < 0) continue;
            const flicker = Math.random() < 0.25 ? rand(0.3, 0.7) : 1;           // мигание
            drawBolt(ctx, bolt.parts, Math.min(1, age / 140), fade * flicker, level);
        }
        requestAnimationFrame(frame);
    }
    frame(startedAt);
}

/* Обновляет отметки «решено», счётчики и полоски во всех списках сразу. */
function refreshProgress() {
    document.querySelectorAll('[data-id]').forEach((el) => {
        el.classList.toggle('done', isSolved(el.dataset.id));
    });

    for (const topic of state.topics) {
        const solved = topic.problems.filter((p) => isSolved(p.id)).length;
        const percent = topic.problems.length ? (solved / topic.problems.length) * 100 : 0;
        document.querySelectorAll(`[data-count="${topic.id}"]`).forEach((el) => {
            el.textContent = `${solved}/${topic.problems.length}`;
        });
        document.querySelectorAll(`[data-meter="${topic.id}"]`).forEach((el) => {
            el.style.setProperty('--p', `${percent}%`);
        });
    }

    const total = state.order.length;
    const solvedTotal = state.order.filter(isSolved).length;
    $('#stat').textContent = `Решено ${solvedTotal} из ${total}.`;
    updateStreak();
}

/* ============ 3. Каталог задач и списки ============ */

async function loadCatalog() {
    const response = await fetch('problems/index.json');
    if (!response.ok) throw new Error(`index.json: ${response.status}`);
    state.topics = await response.json();

    for (const topic of state.topics) {
        for (const problem of topic.problems) {
            state.problems[problem.id] = { ...problem, topic: topic.id, topicTitle: topic.title };
            state.order.push(problem.id);
        }
    }
}

// Боковая панель строится один раз. Дальше меняются только классы,
// поэтому она быстро работает и на сотнях задач.
function renderSidebar() {
    $('#nav').innerHTML = state.topics.map((topic) => `
    <details data-topic="${topic.id}">
      <summary>${escapeHtml(topic.title)} <small data-count="${topic.id}"></small></summary>
      <div class="meter" data-meter="${topic.id}"></div>
      ${topic.problems.map((p) => `
        <a class="it" href="#/${p.id}" data-id="${p.id}"><i>${p.id}</i>${escapeHtml(p.titleRu)}</a>`).join('')}
    </details>`).join('');
}

function markActiveInSidebar(id) {
    document.querySelectorAll('#nav a.it.on').forEach((el) => el.classList.remove('on'));
    const link = $(`#nav a.it[data-id="${id}"]`);
    if (!link) return;
    link.classList.add('on');
    link.closest('details').open = true;                // раскрываем тему текущей задачи
    link.scrollIntoView({ block: 'nearest' });
}

// Главная: темы свёрнуты. При поиске, или если тема одна, раскрываются сами.
function renderHome(query = '') {
    const needle = query.trim().toLowerCase();
    let html = '';

    for (const topic of state.topics) {
        const matches = topic.problems.filter((p) =>
            !needle || `${p.titleRu} ${p.title} ${p.id}`.toLowerCase().includes(needle));
        if (!matches.length) continue;

        const open = needle || state.topics.length === 1 ? 'open' : '';
        html += `
      <details class="topic" ${open}>
        <summary>${escapeHtml(topic.title)} <small data-count="${topic.id}"></small></summary>
        <div class="meter" data-meter="${topic.id}"></div>
        ${matches.map((p) => `
          <a class="row" href="#/${p.id}" data-id="${p.id}"><i>${p.id}</i><span>${escapeHtml(p.titleRu)}</span></a>`).join('')}
      </details>`;
    }

    $('#list').innerHTML = html ||
        '<p class="lead">Ничего не найдено. Попробуйте номер задачи или английское название.</p>';
    refreshProgress();
}

/* ============ 4. Страница задачи ============ */

// Прячем формулы от markdown-парсера (иначе он портит `_` и `\`), потом возвращаем.
function markdownToHtml(source) {
    const formulas = [];
    const protectedText = source.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, (formula) => {
        formulas.push(formula);
        return `@@F${formulas.length - 1}@@`;
    });
    return marked.parse(protectedText).replace(/@@F(\d+)@@/g, (_, i) =>
        formulas[i].replace(/&/g, '&amp;').replace(/</g, '&lt;'));
}

function renderMath(element) {
    if (window.renderMathInElement) {
        renderMathInElement(element, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
            ],
            throwOnError: false,
        });
    } else {
        addEventListener('load', () => renderMath(element), { once: true }); // KaTeX ещё грузится
    }
}

async function fetchStatement(problem) {
    try {
        const response = await fetch(`problems/${problem.topic}/${problem.id}.md`);
        if (!response.ok) throw new Error(response.status);
        const text = await response.text();
        return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''); // убираем front matter
    } catch {
        return `*Не удалось загрузить условие. Проверьте файл \`problems/${problem.topic}/${problem.id}.md\`.*`;
    }
}

function setPagerLink(element, target, label) {
    element.classList.toggle('off', !target);
    if (!target) return;
    element.href = `#/${target.id}`;
    element.innerHTML = `<small>${label}</small>${escapeHtml(target.titleRu)}`;
}

async function showProblem(problem) {
    document.title = `${problem.titleRu} — OlProg Prep`;
    window.scrollTo(0, 0);

    $('#topic').textContent = problem.topicTitle;
    $('#ptitle').textContent = problem.titleRu;
    $('#pid').textContent = `CSES #${problem.id} · ${problem.title}`;
    $('#orig').href = `https://cses.fi/problemset/task/${problem.id}`;
    $('#send').href = `https://cses.fi/problemset/submit/${problem.id}/`;
    $('#solved').checked = isSolved(problem.id);

    const position = state.order.indexOf(problem.id);
    setPagerLink($('#prev'), state.problems[state.order[position - 1]], '← Предыдущая');
    setPagerLink($('#next'), state.problems[state.order[position + 1]], 'Следующая →');

    loadCode();

    $('#md').innerHTML = '<p class="lead">Загрузка…</p>';
    const text = await fetchStatement(problem);
    if (state.current !== problem) return;               // пользователь уже ушёл на другую задачу
    $('#md').innerHTML = markdownToHtml(text);
    renderMath($('#md'));
}

function route() {
    document.body.classList.remove('open');
    const id = location.hash.replace(/^#\/?/, '');
    const problem = state.problems[id] || null;

    state.current = problem;
    pickPhrase();
    $('#home').hidden = Boolean(problem);
    $('#prob').hidden = !problem;
    markActiveInSidebar(id);

    if (problem) {
        showProblem(problem);
    } else {
        document.title = 'OlProg Prep';
        renderHome($('#q').value);
    }
}

/* ============ 5. Редактор ============ */

// Подсветка: прозрачный <textarea> лежит поверх <pre> с раскрашенной копией кода.
const KEYWORDS = {
    cpp: 'auto bool break case char class const constexpr continue default do double else enum float for if inline int long namespace new operator private public return short signed sizeof static struct switch template this typedef typename unsigned using void while true false nullptr vector string pair map set cin cout endl size_t',
    python: 'and as assert break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield print input range len',
    java: 'abstract boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long new package private protected public return short static super switch this throw throws try void while true false null String',
    csharp: 'abstract bool break byte case catch char class const continue decimal default do double else enum false finally float for foreach if in int interface internal is long namespace new null object private protected public return static string struct switch this throw true try using var void while',
};

// Части регулярки. Порядок важен: комментарий, строка, число, слово.
const TOKEN_PARTS = {
    cLike: {
        comment: /\/\/.*|\/\*[\s\S]*?\*\/|^[ \t]*#.*/, // //..., /*...*/, строки #include
        string: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/,
    },
    python: {
        comment: /#.*/,
        string: /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/,
    },
};

const NUMBER = /\b\d[\d.]*\b/;
const WORD = /[A-Za-z_]\w*/;

// Группы в результате: 1 комментарий, 2 строка, 3 число, 4 слово, 5 «(» после слова.
function buildTokenizer({ comment, string }) {
    return new RegExp(
        `(${comment.source})|(${string.source})|(${NUMBER.source})|(${WORD.source})(\\s*\\()?`, 'gm');
}

const TOKENIZERS = {
    cLike: buildTokenizer(TOKEN_PARTS.cLike),
    python: buildTokenizer(TOKEN_PARTS.python),
};

function highlightCode() {
    const language = state.language;
    const keywords = new Set(KEYWORDS[language].split(' '));
    const tokenizer = TOKENIZERS[language === 'python' ? 'python' : 'cLike'];

    const html = escapeHtml($('#code').value).replace(tokenizer,
        (match, comment, string, number, word, paren) => {
            if (comment) return `<span class="c">${match}</span>`;
            if (string) return `<span class="s">${match}</span>`;
            if (number) return `<span class="n">${match}</span>`;
            if (keywords.has(word)) return `<span class="k">${word}</span>${paren || ''}`;
            if (paren) return `<span class="f">${word}</span>${paren}`;   // вызов функции
            return match;
        });

    $('#hl code').innerHTML = html + '\n'; // перевод строки в конце держит высоту слоёв равной
}

function loadCode() {
    const saved = state.progress[state.current.id]?.code?.[state.language];
    $('#code').value = saved ?? TEMPLATES[state.language];
    highlightCode();
}

function saveCode() {
    if (!state.current) return;
    const entry = entryFor(state.current.id);
    const code = $('#code').value;
    entry.code ??= {};

    if (code === TEMPLATES[state.language]) delete entry.code[state.language]; // шаблон не храним
    else entry.code[state.language] = code;
    saveProgress();
}

function changeLanguage(next) {
    saveCode();                                          // сначала сохраняем код прежнего языка
    state.language = next;
    localStorage.setItem(LANGUAGE_KEY, next);
    loadCode();
}

async function copyCode() {
    try {
        await navigator.clipboard.writeText($('#code').value);
        showToast('Код скопирован');
    } catch {
        $('#code').select();
        showToast('Выделено: скопируйте вручную');
    }
}

function downloadCode() {
    const name = state.language === 'java' ? 'Main' : `solution_${state.current.id}`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([$('#code').value]));
    link.download = `${name}.${FILE_EXTENSIONS[state.language]}`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function insertTab(editor) {
    editor.setRangeText('    ', editor.selectionStart, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input'));            // чтобы обновились подсветка и сохранение
}

/* ============ 6. События и запуск ============ */

function bindEvents() {
    addEventListener('hashchange', route);
    $('#menu').addEventListener('click', () => document.body.classList.toggle('open'));
    $('#q').addEventListener('input', (e) => renderHome(e.target.value));

    $('#export').addEventListener('click', exportProgress);
    $('#import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (e) => {
        if (e.target.files[0]) importProgress(e.target.files[0]);
        e.target.value = '';
    });

    $('#solved').addEventListener('change', (e) => setSolved(state.current.id, e.target.checked));

    // Редактор
    const editor = $('#code');
    let saveTimer;
    editor.addEventListener('input', () => {
        highlightCode();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveCode, 500);
    });
    editor.addEventListener('scroll', () => {
        $('#hl').scrollTop = editor.scrollTop;
        $('#hl').scrollLeft = editor.scrollLeft;
    });
    editor.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') { e.preventDefault(); insertTab(editor); }
    });

    $('#lang').value = state.language;
    $('#lang').addEventListener('change', (e) => changeLanguage(e.target.value));
    $('#copy').addEventListener('click', copyCode);
    $('#dl').addEventListener('click', downloadCode);
    $('#reset').addEventListener('click', () => {
        if (!confirm('Заменить код шаблоном для этого языка?')) return;
        editor.value = TEMPLATES[state.language];
        saveCode();
        highlightCode();
    });

    // «Отправить на CSES»: ссылка открывается сама, мы копируем код и ждём возвращения.
    $('#send').addEventListener('click', () => {
        saveCode();
        copyCode();
        state.sentToCses = true;
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !state.sentToCses || !state.current) return;
        state.sentToCses = false;
        setTimeout(() => {
            if (confirm('Решение принято на CSES?')) {
                $('#solved').checked = true;
                setSolved(state.current.id, true);
            }
        }, 300);
    });
}

async function init() {
    state.progress = loadProgress();
    try {
        await loadCatalog();
    } catch (error) {
        console.error(error);
        $('#list').innerHTML = '<p class="lead">Не удалось загрузить problems/index.json. ' +
            'При открытии файла двойным щелчком браузер блокирует загрузку: запустите «python -m http.server».</p>';
        return;
    }

    renderSidebar();
    bindEvents();
    state.flameLevel = FLAME_THRESHOLDS.filter((n) => solvedToday() >= n).length; // без вспышки при загрузке
    state.todayCount = solvedToday();
    route();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js');
    }
}

init();