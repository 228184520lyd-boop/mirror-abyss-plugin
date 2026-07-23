/** Mirror Abyss single-entry compatibility loader. */
globalThis.__MirrorAbyssEntryUrl = import.meta.url;

async function loadClassicBundle() {
    if (globalThis.__MirrorAbyssBundledLifecycle)
        return globalThis.__MirrorAbyssBundledLifecycle;
    const existing = document.querySelector('script[data-mirror-abyss-bundle="1"]');
    if (existing) {
        await new Promise((resolve, reject) => {
            if (globalThis.__MirrorAbyssBundledLifecycle)
                return resolve();
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', reject, { once: true });
        });
        return globalThis.__MirrorAbyssBundledLifecycle;
    }
    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.dataset.mirrorAbyssBundle = '1';
        script.src = new URL('./bundle.js', import.meta.url).href;
        script.async = false;
        script.onload = resolve;
        script.onerror = (event) => reject(new Error(`镜渊单文件运行包加载失败：${script.src}`, { cause: event }));
        document.head.appendChild(script);
    });
    if (!globalThis.__MirrorAbyssBundledLifecycle)
        throw new Error('镜渊运行包已下载，但没有注册生命周期接口');
    return globalThis.__MirrorAbyssBundledLifecycle;
}

const lifecycle = await loadClassicBundle();
export const onActivate = lifecycle.onActivate;
export const onInstall = lifecycle.onInstall;
export const onUpdate = lifecycle.onUpdate;
export const onEnable = lifecycle.onEnable;
export const onDisable = lifecycle.onDisable;
export const onClean = lifecycle.onClean;
export const onDelete = lifecycle.onDelete;
