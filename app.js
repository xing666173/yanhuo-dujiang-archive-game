const chapters = [
  {
    id: 'yanhuo',
    order: 1,
    title: '雁火档案',
    subtitle: '在白洋淀水乡寻找人民智慧',
    location: '白洋淀文化苑 / 雁翎队纪念馆',
    theme: '人民智慧',
    hero: 'assets/generated/chapter-yanhuo.png',
    stamp: 'assets/generated/stamp-yanhuo.png',
    intro: '白洋淀的芦苇、水路和村庄记忆，保存着人民在艰难年代因地制宜、机智斗争的实践经验。',
    clues: [
      ['yanhuo-clue-1', '地形线索', '芦苇水道', '曲折水道是雁翎队熟悉地形、隐蔽行动的重要依托。'],
      ['yanhuo-clue-2', '展品线索', '雁翎队小船', '小船连接侦察、转移和支前，是水上斗争的关键工具。'],
      ['yanhuo-clue-3', '记忆线索', '水乡暗号', '口口相传的信号方式帮助队员在村落和水面之间协同。'],
      ['yanhuo-clue-4', '空间线索', '纪念馆浮雕', '浮雕再现军民同心守护家园的场景。'],
      ['yanhuo-clue-5', '影像线索', '淀上苇影', '芦苇荡既是自然景观，也是抗战记忆的空间线索。']
    ],
    answer: ['yanhuo-clue-1', 'yanhuo-clue-2', 'yanhuo-clue-3'],
    success: '证据拼合成功，白洋淀水乡里的人民智慧被点亮。',
    retry: '证据还没有连到水乡群众的创造性实践，请重新选择。',
    completionLine: '人民智慧来自普通群众对家乡环境的熟悉、创造性协作和保卫家园的决心。'
  },
  {
    id: 'fuxing',
    order: 2,
    title: '复兴之路',
    subtitle: '在中国国家博物馆理解历史纵深',
    location: '中国国家博物馆',
    theme: '历史纵深',
    hero: 'assets/generated/chapter-fuxing.png',
    stamp: 'assets/generated/stamp-fuxing.png',
    intro: '从民族危机、思想觉醒到解放建设与复兴征程，国博展陈帮助青年把今天放进历史长河中理解。',
    clues: [
      ['fuxing-clue-1', '展陈线索', '沉重开篇', '近代危机展陈提示复兴道路从苦难与抗争中展开。'],
      ['fuxing-clue-2', '文献线索', '觉醒文字', '思想启蒙与革命文献呈现先进力量探索道路的过程。'],
      ['fuxing-clue-3', '展品线索', '解放见证', '解放相关展品把人民奋斗与国家命运连接起来。'],
      ['fuxing-clue-4', '模型线索', '建设模型', '建设时期模型展现国家工业化和制度探索。'],
      ['fuxing-clue-5', '影像线索', '复兴影像', '新时代影像把个人生活变化与民族复兴目标相连。']
    ],
    answer: ['fuxing-clue-1', 'fuxing-clue-2', 'fuxing-clue-3'],
    timeline: {
      prompt: '按历史逻辑修复复兴之路时间线。',
      nodes: [
        ['struggle', '苦难抗争'],
        ['awakening', '思想觉醒'],
        ['liberation', '走向解放'],
        ['construction', '建设探索'],
        ['rejuvenation', '民族复兴']
      ],
      answer: ['struggle', 'awakening', 'liberation', 'construction', 'rejuvenation']
    },
    success: '历史脉络已经展开，复兴之路更加清晰。',
    retry: '证据还没有形成纵深线索，请重新组合。',
    completionLine: '历史纵深提醒我们，民族复兴建立在一代代人的抗争、觉醒、建设和接续奋斗之上。'
  },
  {
    id: 'xinyang',
    order: 3,
    title: '信仰抉择',
    subtitle: '在雨花台读懂理想选择',
    location: '雨花台烈士纪念馆',
    theme: '理想选择',
    hero: 'assets/generated/chapter-xinyang.png',
    stamp: 'assets/generated/stamp-xinyang.png',
    intro: '雨花台烈士纪念馆呈现许多青年在生死考验前的选择，让理想从历史叙事变成可以被理解的行动。',
    clues: [
      ['xinyang-clue-1', '文献线索', '烈士书信', '书信中的平静话语显示理想信念经受住了现实考验。'],
      ['xinyang-clue-2', '空间线索', '雨花英烈群像', '群像把不同身份的奋斗者凝聚在共同理想之下。'],
      ['xinyang-clue-3', '展品线索', '牺牲者遗物', '遗物保留了革命者真实生活的温度。'],
      ['xinyang-clue-4', '展墙线索', '信仰展墙', '展墙集中呈现烈士面对威逼和牺牲时的坚定。'],
      ['xinyang-clue-5', '反思线索', '纪念广场', '广场空间让参观者从观看走向默想。']
    ],
    answer: ['xinyang-clue-1', 'xinyang-clue-2', 'xinyang-clue-3'],
    success: '信仰线索成立，理想选择被完整呈现。',
    retry: '选择还没有触及关键时刻的信念，请再试一次。',
    completionLine: '理想选择让青年在关键时刻把信念落实为行动，也让后来者理解信仰的力量。'
  },
  {
    id: 'dujiang',
    order: 4,
    title: '渡江胜利',
    subtitle: '在渡江胜利纪念馆感受人民力量',
    location: '渡江胜利纪念馆',
    theme: '人民力量',
    hero: 'assets/generated/chapter-dujiang.png',
    stamp: 'assets/generated/stamp-dujiang.png',
    intro: '渡江胜利纪念馆把战役部署、群众支前和解放南京的历史连成一条线，突出人民力量如何推动胜利到来。',
    clues: [
      ['dujiang-clue-1', '展品线索', '支前木船', '木船见证群众把生产工具投入渡江支前。'],
      ['dujiang-clue-2', '文献线索', '支前名册', '名册记录普通群众参与运输、保障和组织动员。'],
      ['dujiang-clue-3', '地图线索', '渡江作战图', '作战图展示准备、协同和突破的整体逻辑。'],
      ['dujiang-clue-4', '展陈线索', '胜利号角', '号角象征战役推进到决定性时刻。'],
      ['dujiang-clue-5', '记忆线索', '纪念馆江景', '江面与展陈共同构成渡江记忆的现实坐标。']
    ],
    answer: ['dujiang-clue-1', 'dujiang-clue-2', 'dujiang-clue-3'],
    timeline: {
      prompt: '按渡江战役叙事顺序排列节点。',
      nodes: [
        ['prepare', '战前准备'],
        ['support', '群众支前'],
        ['crossing', '横渡长江'],
        ['liberation', '迎来解放'],
        ['memory', '铭记传承']
      ],
      answer: ['prepare', 'support', 'crossing', 'liberation', 'memory']
    },
    success: '证据成立，人民力量推动历史向前。',
    retry: '线索还没有连到群众支前与战役胜利，请重新选择。',
    completionLine: '人民力量汇成渡江胜势，也让胜利记忆在纪念馆和现实江岸之间不断延续。'
  },
  {
    id: 'yanxu',
    order: 5,
    title: '延续新章',
    subtitle: '在社区与校园问卷中书写青年担当',
    location: '颐和路社区将军馆 + 东南大学学生问卷',
    theme: '青年担当',
    hero: 'assets/generated/chapter-yanxu.png',
    stamp: 'assets/generated/stamp-yanxu.png',
    intro: '社区红色记忆与东南大学学生问卷的现实反馈相连，让实践最终落到青年如何理解责任、参与社会。',
    clues: [
      ['yanxu-clue-1', '空间线索', '将军馆展柜', '展柜呈现革命军人的人生选择和家国责任。'],
      ['yanxu-clue-2', '访谈线索', '社区讲述', '社区讲解把人物经历转化为可交流、可传递的公共记忆。'],
      ['yanxu-clue-3', '调研线索', '学生问卷', '问卷记录东大学生对红色实践和青年责任的反馈。'],
      ['yanxu-clue-4', '笔记线索', '实践笔记', '笔记沉淀走访后的问题意识和改进方向。'],
      ['yanxu-clue-5', '行动线索', '宣讲提纲', '提纲把路线收获整理成面向同龄人的表达。']
    ],
    answer: ['yanxu-clue-1', 'yanxu-clue-2', 'yanxu-clue-3'],
    success: '实践线索完成，青年担当被清晰记录。',
    retry: '线索还没有体现从红色记忆到青年行动的过程，请重新选择。',
    completionLine: '青年担当是在理解历史、倾听社区和回应同伴之后，把责任落实到真实行动中。'
  }
];

const state = {
  view: 'home',
  currentChapterId: 'yanhuo',
  selectedIds: [],
  timelineOrder: {},
  feedback: null,
  timelineFeedback: null,
  modalChapterId: null,
  completedIds: loadCompletedIds(),
  displayMode: false
};

function loadCompletedIds() {
  try {
    return JSON.parse(localStorage.getItem('yanhuo-preview-completed') || '[]');
  } catch (error) {
    return [];
  }
}

function saveCompletedIds() {
  try {
    localStorage.setItem('yanhuo-preview-completed', JSON.stringify(state.completedIds));
  } catch (error) {
    // File previews may run in stricter browser modes; in-memory progress still works.
  }
}

function getCompletedSet() {
  return new Set(state.completedIds);
}

function getChapter(id) {
  return chapters.find((chapter) => chapter.id === id) || chapters[0];
}

function getNextChapter(id) {
  const index = chapters.findIndex((chapter) => chapter.id === id);
  return chapters[index + 1] || null;
}

function getNextUnlockedOrder() {
  const completed = getCompletedSet();
  const next = chapters.find((chapter) => !completed.has(chapter.id));
  return next ? next.order : chapters.length + 1;
}

function isChapterLocked(chapter) {
  return !state.displayMode && !getCompletedSet().has(chapter.id) && chapter.order > getNextUnlockedOrder();
}

function renderHome() {
  const completed = state.completedIds.length;
  return `
    <section class="screen home">
      <div class="shell">
        ${renderTopbar()}
        <div class="hero">
          <div class="kicker">东南大学暑期社会实践</div>
          <h1 class="title-xl">雁火渡江红色记忆档案馆</h1>
          <p class="body-copy">修复一份关于红色血脉的缺失档案，沿着雁火与渡江的线索，完成一场青年与历史的对话。</p>
          <div class="action-row">
            <button class="primary-button" data-action="goto" data-view="hall">进入档案馆</button>
            <button class="ghost-button" data-action="goto" data-view="gallery">成果展厅</button>
          </div>
        </div>
        <div class="hero-card">
          <div>
            <strong>待修复档案</strong>
            <span>五个章节串联白洋淀、国博、雨花台、渡江胜利纪念馆与社区调研成果。</span>
          </div>
          <div class="progress-ring">${completed}/5</div>
        </div>
      </div>
    </section>
  `;
}

function renderHall() {
  const completed = getCompletedSet();
  return `
    <section class="screen hall">
      <div class="shell">
        ${renderTopbar()}
        <header class="hall-header">
          <div class="kicker">Archive Hall</div>
          <h2 class="title-md">红色记忆档案大厅</h2>
          <p class="body-copy">已归档 ${completed.size} / ${chapters.length} 份档案。</p>
          <div class="action-row">
            <button class="primary-button" data-action="goto" data-view="report">查看修复报告</button>
            <button class="ghost-button" data-action="display-mode">${state.displayMode ? '关闭展示模式' : '开启展示模式'}</button>
            <button class="danger-button" data-action="reset">重置进度</button>
          </div>
        </header>
        <div class="chapter-grid">
          ${chapters.map((chapter) => renderChapterCard(chapter)).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderChapterCard(chapter) {
  const completed = getCompletedSet().has(chapter.id);
  const locked = isChapterLocked(chapter);
  return `
    <article class="chapter-card ${locked ? 'locked' : ''}">
      <img src="${chapter.hero}" alt="${chapter.title}">
      ${completed ? `<img class="stamp-small" src="${chapter.stamp}" alt="已归档">` : ''}
      <div class="chapter-info">
        <span class="chapter-order">档案 0${chapter.order} · ${chapter.theme}</span>
        <strong class="chapter-title">${chapter.title}</strong>
        <span class="chapter-meta">${chapter.location}</span>
        <button class="${locked ? 'ghost-button' : 'primary-button'}" data-action="open-chapter" data-id="${chapter.id}">
          ${locked ? '待解锁' : completed ? '再次查看' : '开始修复'}
        </button>
      </div>
    </article>
  `;
}

function renderChapter() {
  const chapter = getChapter(state.currentChapterId);
  const selected = new Set(state.selectedIds);
  const evidenceReady = state.feedback && state.feedback.type === 'success';
  return `
    <section class="screen chapter-screen" style="--chapter-bg: url('${chapter.hero}')">
      <div class="shell">
        ${renderTopbar()}
        <header class="page-header">
          <div class="kicker">档案 0${chapter.order} · ${chapter.theme}</div>
          <h2 class="title-md">${chapter.title}</h2>
          <p class="body-copy">${chapter.subtitle}。${chapter.intro}</p>
        </header>
        <div class="chapter-layout">
          <div class="task-panel paper-panel">
            <h3>证据匹配</h3>
            <p class="paper-copy">选择三张最有力的材料卡，放入档案证据板。</p>
            <div class="slot-row">
              ${[0, 1, 2].map((index) => `<div class="slot">${state.selectedIds[index] ? `证据 ${index + 1}` : '待放入'}</div>`).join('')}
            </div>
            ${state.feedback ? `<div class="feedback ${state.feedback.type}">${state.feedback.message}</div>` : ''}
            <div class="chapter-actions">
              <button class="primary-button" data-action="submit-evidence">提交证据</button>
              <button class="ghost-button" data-action="clear-evidence">清空选择</button>
            </div>
            ${chapter.timeline ? renderTimelinePanel(chapter, evidenceReady) : ''}
          </div>
          <div class="clue-list">
            ${chapter.clues.map((clue) => {
              const [id, type, title, summary] = clue;
              return `
                <article class="clue-card ${selected.has(id) ? 'selected' : ''}">
                  <span class="clue-type">${type}</span>
                  <strong class="clue-title">${title}</strong>
                  <span class="clue-summary">${summary}</span>
                  <button class="small-button" data-action="toggle-evidence" data-id="${id}">
                    ${selected.has(id) ? '移出证据板' : '加入证据板'}
                  </button>
                </article>
              `;
            }).join('')}
          </div>
        </div>
      </div>
      ${state.modalChapterId === chapter.id ? renderCompleteModal(chapter) : ''}
    </section>
  `;
}

function renderTimelinePanel(chapter, evidenceReady) {
  const order = getTimelineOrder(chapter);
  const nodeMap = new Map(chapter.timeline.nodes);
  return `
    <div class="timeline-panel glass-panel">
      <h3>${chapter.timeline.prompt}</h3>
      <div class="timeline-list">
        ${order.map((nodeId, index) => `
          <div class="timeline-node">
            <span>${index + 1}. ${nodeMap.get(nodeId)}</span>
            <span>
              <button class="small-button" data-action="move-node" data-id="${nodeId}" data-dir="up">上移</button>
              <button class="small-button" data-action="move-node" data-id="${nodeId}" data-dir="down">下移</button>
            </span>
          </div>
        `).join('')}
      </div>
      <div class="chapter-actions">
        <button class="ghost-button" data-action="submit-timeline" ${evidenceReady ? '' : 'disabled'}>提交时间线</button>
      </div>
      ${state.timelineFeedback ? `<div class="feedback ${state.timelineFeedback.type}">${state.timelineFeedback.message}</div>` : ''}
    </div>
  `;
}

function renderCompleteModal(chapter) {
  return `
    <div class="modal">
      <div class="modal-card paper-panel">
        <img src="${chapter.stamp}" alt="归档印章">
        <h3>${chapter.title}已归档</h3>
        <p class="paper-copy">${chapter.completionLine}</p>
        <div class="modal-actions">
          <button class="primary-button" data-action="next-chapter">继续</button>
          <button class="ghost-button" data-action="goto" data-view="hall">返回大厅</button>
        </div>
      </div>
    </div>
  `;
}

function renderReport() {
  const completed = chapters.filter((chapter) => getCompletedSet().has(chapter.id));
  return `
    <section class="screen report">
      <div class="shell">
        ${renderTopbar()}
        <div class="report-card paper-panel">
          <div class="kicker">雁火渡江</div>
          <h2 class="title-md" style="color:#211812">红色记忆修复报告</h2>
          <p class="paper-copy">已归档 ${completed.length} / ${chapters.length} 份档案。</p>
          ${completed.length ? `
            <div class="stamp-wall">
              ${completed.map((chapter) => `<img src="${chapter.stamp}" alt="${chapter.title}印章">`).join('')}
            </div>
            <div class="summary-list">
              ${completed.map((chapter) => `<div class="summary-line">${chapter.theme}：${chapter.completionLine}</div>`).join('')}
            </div>
          ` : `<div class="empty-state">完成任一章节后，这里会生成报告摘要和印章墙。</div>`}
        </div>
      </div>
    </section>
  `;
}

function renderGallery() {
  const items = [
    ['公众号专题推文', '讲述完整实践路线、场馆细节、访谈发现和青年思考。'],
    ['3-5分钟短视频', '以抗战烽火、革命胜利、信仰传承、青年担当为叙事线。'],
    ['静态展示网页', '沉淀活动背景、实践路线、调研发现和影像素材。'],
    ['调研总结报告', '分析青年家国情怀认知、红色场馆传播效果和青年化表达路径。'],
    ['轻量文创设计', '使用雁翎、渡江木船、雨花石和将星等视觉元素。']
  ];
  return `
    <section class="screen">
      <div class="shell">
        ${renderTopbar()}
        <header class="page-header">
          <div class="kicker">Archive Exhibition</div>
          <h2 class="title-md">成果展厅</h2>
        </header>
        <div class="gallery-list">
          ${items.map(([title, desc]) => `
            <article class="gallery-card paper-panel">
              <h3>${title}</h3>
              <p class="paper-copy">${desc}</p>
            </article>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderAbout() {
  return `
    <section class="screen">
      <div class="shell">
        ${renderTopbar()}
        <header class="page-header">
          <div class="kicker">About Project</div>
          <h2 class="title-md">雁火渡江：红色血脉中的青春回响</h2>
        </header>
        <div class="about-stack">
          <article class="about-card glass-panel"><p class="body-copy">本项目聚焦“建功十五五背景下的青年家国情怀与红色记忆传承”，以白洋淀、国博、雨花台、渡江胜利纪念馆和颐和路社区将军馆为叙事坐标。</p></article>
          <article class="about-card glass-panel"><p class="body-copy">小游戏把实践材料转化为档案修复玩法：展品、访谈、问卷、照片和日志成为线索卡，玩家通过证据匹配与时间线修复完成红色记忆归档。</p></article>
          <article class="about-card glass-panel"><p class="body-copy">团队：雁火渡江实践团。成果矩阵包括公众号推文、短视频、静态网页、调研报告、文创设计和互动小程序。</p></article>
        </div>
      </div>
    </section>
  `;
}

function renderTopbar() {
  return `
    <nav class="topbar">
      <div class="brand">雁火渡江 · 浏览器预览</div>
      <div class="nav-row">
        <button class="ghost-button" data-action="goto" data-view="home">首页</button>
        <button class="ghost-button" data-action="goto" data-view="hall">档案馆</button>
        <button class="ghost-button" data-action="goto" data-view="report">报告</button>
        <button class="ghost-button" data-action="goto" data-view="about">说明</button>
      </div>
    </nav>
  `;
}

function render() {
  const root = document.getElementById('preview-app');
  const screens = {
    home: renderHome,
    hall: renderHall,
    chapter: renderChapter,
    report: renderReport,
    gallery: renderGallery,
    about: renderAbout
  };
  root.innerHTML = (screens[state.view] || renderHome)();
}

function getTimelineOrder(chapter) {
  if (!chapter.timeline) return [];
  if (!state.timelineOrder[chapter.id]) {
    state.timelineOrder[chapter.id] = chapter.timeline.nodes.map(([id]) => id).reverse();
  }
  return state.timelineOrder[chapter.id];
}

function sameSet(actual, expected) {
  if (actual.length !== expected.length) return false;
  const actualSorted = actual.slice().sort();
  const expectedSorted = expected.slice().sort();
  return expectedSorted.every((id, index) => id === actualSorted[index]);
}

function submitEvidence() {
  const chapter = getChapter(state.currentChapterId);
  const correct = sameSet(state.selectedIds, chapter.answer);
  state.feedback = {
    type: correct ? 'success' : 'warn',
    message: correct ? chapter.success : chapter.retry
  };
  if (correct && !chapter.timeline) completeChapter(chapter);
  render();
}

function submitTimeline() {
  const chapter = getChapter(state.currentChapterId);
  const order = getTimelineOrder(chapter);
  const correct = chapter.timeline.answer.every((id, index) => id === order[index]);
  state.timelineFeedback = {
    type: correct ? 'success' : 'warn',
    message: correct ? '时间线已修复。' : '顺序还没有形成完整逻辑，请重新梳理。'
  };
  if (correct) completeChapter(chapter);
  render();
}

function completeChapter(chapter) {
  if (!state.completedIds.includes(chapter.id)) {
    state.completedIds.push(chapter.id);
    saveCompletedIds();
  }
  state.modalChapterId = chapter.id;
}

function openChapter(id) {
  const chapter = getChapter(id);
  if (isChapterLocked(chapter)) return;
  state.view = 'chapter';
  state.currentChapterId = id;
  state.selectedIds = [];
  state.feedback = null;
  state.timelineFeedback = null;
  state.modalChapterId = null;
  render();
}

function moveTimelineNode(nodeId, direction) {
  const chapter = getChapter(state.currentChapterId);
  const order = getTimelineOrder(chapter).slice();
  const index = order.indexOf(nodeId);
  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
  [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
  state.timelineOrder[chapter.id] = order;
  state.timelineFeedback = null;
  render();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  if (action === 'goto') {
    state.view = button.dataset.view;
    state.modalChapterId = null;
    render();
  }
  if (action === 'open-chapter') openChapter(button.dataset.id);
  if (action === 'toggle-evidence') {
    const id = button.dataset.id;
    const exists = state.selectedIds.includes(id);
    if (exists) state.selectedIds = state.selectedIds.filter((item) => item !== id);
    else if (state.selectedIds.length < 3) state.selectedIds.push(id);
    else state.feedback = { type: 'warn', message: '证据板最多放入三条线索。' };
    render();
  }
  if (action === 'clear-evidence') {
    state.selectedIds = [];
    state.feedback = null;
    render();
  }
  if (action === 'submit-evidence') submitEvidence();
  if (action === 'move-node') moveTimelineNode(button.dataset.id, button.dataset.dir);
  if (action === 'submit-timeline') submitTimeline();
  if (action === 'next-chapter') {
    const next = getNextChapter(state.currentChapterId);
    if (next) openChapter(next.id);
    else {
      state.view = 'report';
      state.modalChapterId = null;
      render();
    }
  }
  if (action === 'display-mode') {
    state.displayMode = !state.displayMode;
    render();
  }
  if (action === 'reset') {
    state.completedIds = [];
    saveCompletedIds();
    state.displayMode = false;
    state.selectedIds = [];
    state.timelineOrder = {};
    render();
  }
});

render();
