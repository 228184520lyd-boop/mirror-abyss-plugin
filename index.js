import { startApplication } from './app.js?v=4.0.51';

const getContext = globalThis.SillyTavern?.getContext;
if (typeof getContext !== 'function') throw new Error('SillyTavern 尚未就绪');
const initialContext = getContext();

startApplication(initialContext, handleHostEvent => {
  const names = [
    'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED',
    'CHAT_CHANGED', 'GENERATION_STARTED', 'WORLD_INFO_ACTIVATED', 'WORLDINFO_UPDATED',
  ];
  for (const name of names) {
    const event = initialContext.eventTypes?.[name];
    if (event) initialContext.eventSource?.on?.(event, (...args) => handleHostEvent(name, ...args));
  }
});
