const activeControllers = new Set();
let acceptingRequests = true;
export function setRequestAcceptance(accepting) {
    acceptingRequests = accepting;
}
export function beginModelRequest() {
    if (!acceptingRequests)
        throw new Error('镜渊已禁用，不再接受新请求');
    const controller = new AbortController();
    activeControllers.add(controller);
    return controller;
}
export function finishModelRequest(controller) {
    activeControllers.delete(controller);
}
export function abortActiveRequests() {
    for (const controller of activeControllers)
        controller.abort();
    activeControllers.clear();
}
