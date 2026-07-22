const activeControllers = new Map();
let acceptingRequests = true;
export function setRequestAcceptance(accepting) {
    acceptingRequests = accepting;
}
export function beginModelRequest(metadata) {
    if (!acceptingRequests)
        throw new Error('镜渊已禁用，不再接受新请求');
    const controller = new AbortController();
    activeControllers.set(controller, metadata);
    return controller;
}
export function finishModelRequest(controller) {
    activeControllers.delete(controller);
}
export function abortActiveRequests(predicate = () => true) {
    let aborted = 0;
    for (const [controller, metadata] of activeControllers) {
        if (!predicate(metadata))
            continue;
        aborted += 1;
        controller.abort();
        activeControllers.delete(controller);
    }
    return aborted;
}
/** 历史内容变化会使所有业务结果失效，但只读诊断不依赖正文快照。 */
export function abortActiveBusinessRequests() {
    return abortActiveRequests((metadata) => metadata.requestClass === 'business');
}
/** 新正文只允许抢占自动总结业务请求；诊断和其他业务链不受影响。 */
export function abortActiveAutomaticSummaryRequests() {
    return abortActiveRequests((metadata) => (metadata.requestClass === 'business'
        && ['smallSummary', 'largeSummary'].includes(metadata.task)));
}
//# sourceMappingURL=requests.js.map