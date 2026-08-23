/**
 * [MIRROR ABYSS 全代码职责锁]
 * 文件：index.js
 * 当前职责：发布包启动入口：只加载当前 bundle 并接入 SillyTavern；不得追加另一条业务主链。
 * 
 * 强制开发规则：
 * 1. 本文件现有可执行代码全部属于当前基线；没有用户明确需求，不得“顺手优化”、改语义、改触发条件或新增旁路。
 * 2. 修改前先沿真实调用链确认输入、输出、状态来源和调用方；不得只看单个 helper 就重写行为。
 * 3. 已经属于模型职责的语义判断，不得在插件里再次猜测、拦截或改写。
 * 4. 已经属于插件职责的确定性工作，只做格式、身份、标签、调度、事务、回滚和宿主边界保护。
 * 5. 注释下方未逐字重复说明的表达式、参数、对象字段和调用顺序也属于当前基线；不要因“看起来可以简化”而改变。
 * 6. 若用户明确要求修改某一职责，只改对应真实链路；不要扩散到无关模块。
 */
/**
 * Mirror Abyss — 移动端安全浮动加载器
 *
 * 职责：在宿主页面挂载启动按钮，按需动态 import('./app.js')，
 * 再转发 SillyTavern 扩展生命周期钩子到核心包。
 * 不包含业务语义；核心逻辑在同包 app.js。
 *
 * 版本：3.0.0-lite.ui.19-mobile-layout
 */
// [MA-LOCK] 数据来源锁：LOADER_ID 只保存当前语句定义的数据来源/中间结果；不要让同一概念再出现第二来源或偷偷改类型。
const LOADER_ID = 'mirror-abyss-loader-control';
// [MA-LOCK] 数据来源锁：APP_ROOT_ID 只保存当前语句定义的数据来源/中间结果；不要让同一概念再出现第二来源或偷偷改类型。
const APP_ROOT_ID = 'mirror-abyss-core-control';
// [MA-LOCK] 数据来源锁：loaded 只保存当前语句定义的数据来源/中间结果；不要让同一概念再出现第二来源或偷偷改类型。
let loaded;
// [MA-LOCK] 数据来源锁：activating 只保存当前语句定义的数据来源/中间结果；不要让同一概念再出现第二来源或偷偷改类型。
let activating;

// [MA-LOCK] 函数职责锁：mount 保持当前签名、输入输出和调用职责；不要在函数内增加与其职责无关的第二逻辑。
function mount(title = '点击启动镜渊') {
  // [MA-LOCK] 条件门锁：当前 if 条件就是现有触发边界；没有明确需求，不得扩大、缩小或增加同义触发条件。
  if (typeof document === 'undefined') return;
  // [MA-LOCK] 条件门锁：当前 if 条件就是现有触发边界；没有明确需求，不得扩大、缩小或增加同义触发条件。
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', () => mount(title), { once: true });
    // [MA-LOCK] 返回契约锁：保持当前返回值形态和语义；调用方可能依赖该类型、字段和空值约定。
    return;
  }
  // [MA-LOCK] 条件门锁：当前 if 条件就是现有触发边界；没有明确需求，不得扩大、缩小或增加同义触发条件。
  if (document.getElementById(APP_ROOT_ID) || document.getElementById(LOADER_ID)) return;
  // [MA-LOCK] 数据来源锁：root 只保存当前语句定义的数据来源/中间结果；不要让同一概念再出现第二来源或偷偷改类型。
  const root = document.createElement('div');
  // [MA-LOCK] 状态写入锁：root.id 的值来源以当前赋值链为准；不要在别处增加竞争写入或语义兜底。
  root.id = LOADER_ID;
  root.style.cssText = 'position:fixed!important;right:max(10px,env(safe-area-inset-right))!important;top:50dvh!important;transform:translateY(-50%)!important;z-index:10052!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;';
  // [MA-LOCK] 数据来源锁：button 只保存当前语句定义的数据来源/中间结果；不要让同一概念再出现第二来源或偷偷改类型。
  const button = document.createElement('button');
  // [MA-LOCK] 状态写入锁：button.type 的值来源以当前赋值链为准；不要在别处增加竞争写入或语义兜底。
  button.type = 'button';
  // [MA-LOCK] 状态写入锁：button.title 的值来源以当前赋值链为准；不要在别处增加竞争写入或语义兜底。
  button.title = title;
  button.setAttribute('aria-label', '启动并打开镜渊');
  button.style.cssText = 'display:flex!important;align-items:center!important;justify-content:center!important;width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;padding:0!important;border:1px solid rgba(255,255,255,.24)!important;border-radius:50%!important;background:#141418!important;color:#fff!important;box-shadow:0 3px 12px rgba(0,0,0,.42)!important;cursor:pointer!important;pointer-events:auto!important;touch-action:none!important;user-select:none!important;-webkit-tap-highlight-color:transparent!important;';
  // [MA-LOCK] 状态写入锁：button.innerHTML 的值来源以当前赋值链为准；不要在别处增加竞争写入或语义兜底。
  button.innerHTML = '<i class="fa-solid fa-circle-nodes" style="font-size:14px;pointer-events:none"></i>';
  button.addEventListener('pointerdown', event => event.stopPropagation());
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    void activate(true);
  });
  root.append(button);
  document.body.append(root);
}

// [MA-LOCK] 函数职责锁：showError 保持当前签名、输入输出和调用职责；不要在函数内增加与其职责无关的第二逻辑。
function showError(error) {
  // [MA-LOCK] 数据来源锁：button 只保存当前语句定义的数据来源/中间结果；不要让同一概念再出现第二来源或偷偷改类型。
  const button = document.getElementById(LOADER_ID)?.querySelector?.('button');
  // [MA-LOCK] 数据来源锁：message 只保存当前语句定义的数据来源/中间结果；不要让同一概念再出现第二来源或偷偷改类型。
  const message = error instanceof Error ? error.message : String(error);
  // [MA-LOCK] 条件门锁：当前 if 条件就是现有触发边界；没有明确需求，不得扩大、缩小或增加同义触发条件。
  if (button) {
    // [MA-LOCK] 状态写入锁：button.disabled 的值来源以当前赋值链为准；不要在别处增加竞争写入或语义兜底。
    button.disabled = false;
    // [MA-LOCK] 状态写入锁：button.title 的值来源以当前赋值链为准；不要在别处增加竞争写入或语义兜底。
    button.title = `镜渊启动失败，点击重试：${message}`;
    // [MA-LOCK] 状态写入锁：button.innerHTML 的值来源以当前赋值链为准；不要在别处增加竞争写入或语义兜底。
    button.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="font-size:14px;pointer-events:none"></i>';
  }
  console.error('[MirrorAbyss] application bundle failed to load', error);
}

// [MA-LOCK] 函数职责锁：load 保持当前签名、输入输出和调用职责；不要在函数内增加与其职责无关的第二逻辑。
function load() {
  mount();
  // [MA-LOCK] 返回契约锁：保持当前返回值形态和语义；调用方可能依赖该类型、字段和空值约定。
  return loaded ??= import('./app.js?ui=3.0.0-lite.ui.19-mobile-layout').catch(error => {
    loaded = undefined;
    showError(error);
    // [MA-LOCK] 失败契约锁：当前 throw 表示不能安全继续；不要用猜测性兜底把明确失败改成静默成功。
    throw error;
  });
}

// [MA-LOCK] 函数职责锁：openRealPanel 保持当前签名、输入输出和调用职责；不要在函数内增加与其职责无关的第二逻辑。
async function openRealPanel() {
  // [MA-LOCK] 遍历锁：当前循环只遍历现有数据集合；不要在循环里悄悄改变集合身份、顺序或新增跨轮状态。
  for (let attempt = 0; attempt < 40; attempt += 1) {
    // [MA-LOCK] 数据来源锁：launcher 只保存当前语句定义的数据来源/中间结果；不要让同一概念再出现第二来源或偷偷改类型。
    const launcher = document.querySelector(`#${APP_ROOT_ID} .ma-lite-launcher`);
    // [MA-LOCK] 条件门锁：当前 if 条件就是现有触发边界；没有明确需求，不得扩大、缩小或增加同义触发条件。
    if (launcher) {
      launcher.click();
      // [MA-LOCK] 返回契约锁：保持当前返回值形态和语义；调用方可能依赖该类型、字段和空值约定。
      return;
    }
    // [MA-LOCK] 异步顺序锁：当前 await 保证操作顺序/提交边界；不要随意并行化造成状态竞态。
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

// [MA-LOCK] 函数职责锁：activate 保持当前签名、输入输出和调用职责；不要在函数内增加与其职责无关的第二逻辑。
async function activate(fromClick = false) {
  // [MA-LOCK] 条件门锁：当前 if 条件就是现有触发边界；没有明确需求，不得扩大、缩小或增加同义触发条件。
  if (activating) return activating;
  // [MA-LOCK] 数据来源锁：button 只保存当前语句定义的数据来源/中间结果；不要让同一概念再出现第二来源或偷偷改类型。
  const button = document.getElementById(LOADER_ID)?.querySelector?.('button');
  // [MA-LOCK] 条件门锁：当前 if 条件就是现有触发边界；没有明确需求，不得扩大、缩小或增加同义触发条件。
  if (button) {
    // [MA-LOCK] 状态写入锁：button.disabled 的值来源以当前赋值链为准；不要在别处增加竞争写入或语义兜底。
    button.disabled = true;
    // [MA-LOCK] 状态写入锁：button.title 的值来源以当前赋值链为准；不要在别处增加竞争写入或语义兜底。
    button.title = '镜渊正在启动';
  }
  activating = (async () => {
    // [MA-LOCK] 异常边界锁：try 保护当前操作边界；不得借异常处理重新解释业务语义。
    try {
      // [MA-LOCK] 数据来源锁：mod 只保存当前语句定义的数据来源/中间结果；不要让同一概念再出现第二来源或偷偷改类型。
      const mod = await load();
      // [MA-LOCK] 异步顺序锁：当前 await 保证操作顺序/提交边界；不要随意并行化造成状态竞态。
      await mod.onActivate();
      document.getElementById(LOADER_ID)?.remove();
      // [MA-LOCK] 条件门锁：当前 if 条件就是现有触发边界；没有明确需求，不得扩大、缩小或增加同义触发条件。
      if (fromClick) await openRealPanel();
    } catch (error) {
      showError(error);
      // [MA-LOCK] 失败契约锁：当前 throw 表示不能安全继续；不要用猜测性兜底把明确失败改成静默成功。
      throw error;
    } finally {
      activating = undefined;
      // [MA-LOCK] 数据来源锁：current 只保存当前语句定义的数据来源/中间结果；不要让同一概念再出现第二来源或偷偷改类型。
      const current = document.getElementById(LOADER_ID)?.querySelector?.('button');
      // [MA-LOCK] 条件门锁：当前 if 条件就是现有触发边界；没有明确需求，不得扩大、缩小或增加同义触发条件。
      if (current) current.disabled = false;
    }
  })();
  // [MA-LOCK] 返回契约锁：保持当前返回值形态和语义；调用方可能依赖该类型、字段和空值约定。
  return activating;
}

export async function onActivate() { return activate(false); }
export async function onEnable() { return activate(false); }
export async function onDisable() {
  document.getElementById(LOADER_ID)?.remove();
  // [MA-LOCK] 条件门锁：当前 if 条件就是现有触发边界；没有明确需求，不得扩大、缩小或增加同义触发条件。
  if (loaded) return (await loaded).onDisable();
  document.getElementById(APP_ROOT_ID)?.remove();
}
export async function onDelete() {
  document.getElementById(LOADER_ID)?.remove();
  // [MA-LOCK] 条件门锁：当前 if 条件就是现有触发边界；没有明确需求，不得扩大、缩小或增加同义触发条件。
  if (loaded) return (await loaded).onDelete();
  document.getElementById(APP_ROOT_ID)?.remove();
}
export async function onInstall() { return (await load()).onInstall(); }
export async function onUpdate() { return (await load()).onUpdate(); }
export async function onClean() { if (loaded) return (await loaded).onClean(); }
mount();
