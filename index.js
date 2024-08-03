import { characters, chat, chat_metadata, event_types, eventSource, extension_prompt_roles, extension_prompt_types, Generate, messageFormatting, saveChatConditional, sendMessageAsUser, setCharacterId, setExtensionPrompt, system_message_types, this_chid } from '../../../../script.js';
import { saveMetadataDebounced } from '../../../extensions.js';
import { executeSlashCommandsWithOptions } from '../../../slash-commands.js';
import { delay } from '../../../utils.js';
import { getRegexedString, regex_placement } from '../../regex/engine.js';
import { Settings, STORY_POSITION, WIDTH_TYPE } from './src/Settings.js';


/**@type {Settings} */
let settings;


function isRole(mes, roles) {
    const isNarrator = mes.extra?.type === system_message_types.NARRATOR;
    for (const role of roles) {
        switch (role) {
            case 'system': {
                if (isNarrator && !mes.is_user) return true;
                break;
            }
            case 'assistant': {
                if (!isNarrator && !mes.is_user) return true;
                break;
            }
            case 'user': {
                if (!isNarrator && mes.is_user) return true;
                break;
            }
        }
    }
    return false;
}


//TODO what to do with long chats? (custom token limiter? user-setting "start at message #"?)
//TODO message context menu
//x swipes
//TODO edit
//x auto scroll
//TODO new convo (while saving the old one)
//x settings page
//x STscript before / after message [chat]
//TODO add CodeSetting for STscript
//TODO pause codex? (script-before might change WI)
//TODO injects [chat]
//x where to place <story> (depth? start?) [chat]
//x message bubble colors [ext]
//x font size [ext]
//x panel width (only left space / % of available width) [ext]
//TODO regex [chat?]
//TODO select char (how to include char persona?) [chat]



let history = [];
const dom = {
    /**@type {HTMLElement} */
    messages: undefined,
    /**@type {HTMLElement} */
    input: undefined,
};
const save = ()=>{
    if (!chat_metadata.chatchat) chat_metadata.chatchat = {
        settings: {},
        history: [],
    };
    chat_metadata.chatchat.history = history;
    saveMetadataDebounced();
};
const onChatChanged = async()=>{
    settings.hide();
    settings.load();
    settings.registerSettings();
    await settings.init();
    history = chat_metadata.chatchat?.history ?? [];
    dom.messages.innerHTML = '';
    for (const mes of history) {
        makeMessage(mes, ()=>{
            history.splice(history.indexOf(mes), 1);
            save();
        });
    }
};
const makeMessage = (mes, onDelete, replace = null)=>{
    const content = messageFormatting(mes.mes, mes.name, mes.is_system, mes.is_user, -1);
    const isUser = mes.is_user;
    let mesText;
    const root = document.createElement('div'); {
        root.classList.add('stac--message');
        root.classList.add(`stac--${isUser ? 'user' : 'bot'}`);
        root.classList.add('mes');
        if (!isUser) {
            const ava = document.createElement('div'); {
                ava.classList.add('stac--avatar');
                const img = document.createElement('img'); {
                    img.classList.add('stac--avatarImg');
                    img.src = `/thumbnail?type=avatar&file=${settings.character}`;
                    ava.append(img);
                }
                root.append(ava);
            }
        }
        const details = document.createElement('div'); {
            details.classList.add('stac--details');
            const dt = document.createElement('div'); {
                dt.classList.add('stac--date');
                dt.textContent = mes.send_date;
                details.append(dt);
            }
            const actions = document.createElement('div'); {
                actions.classList.add('stac--actions');
                const del = document.createElement('div'); {
                    del.classList.add('stac--action');
                    del.classList.add('fa-solid', 'fa-trash-can');
                    del.title = 'Delete message\n---\nNo warning, no confirm. When it\'s gone it\'s gone...';
                    del.addEventListener('click', async()=>{
                        onDelete();
                        root.classList.add('stac--remove');
                        await delay(410);
                        root.remove();
                    });
                    actions.append(del);
                }
                const swipeLeft = document.createElement('div'); {
                    swipeLeft.classList.add('stac--action');
                    swipeLeft.classList.add('stac--swipeLeft');
                    swipeLeft.classList.add('fa-solid', 'fa-chevron-left');
                    swipeLeft.title = 'Show previous swipe';
                    swipeLeft.addEventListener('click', ()=>{
                        if (mes.swipe_id == 0) return;
                        mes.swipe_id--;
                        mes.mes = mes.swipes[mes.swipe_id];
                        mes.extra = mes.swipe_info[mes.swipe_id].extra;
                        mes.gen_finished = mes.swipe_info[mes.swipe_id].gen_finished;
                        mes.gen_started = mes.swipe_info[mes.swipe_id].gen_started;
                        mes.send_date = mes.swipe_info[mes.swipe_id].send_date;
                        txt.innerHTML = messageFormatting(mes.mes, mes.name, mes.is_system, mes.is_user, -1);
                        swipe.textContent = `${(mes.swipe_id ?? 0) + 1} / ${(mes.swipes?.length ?? 1)}`;
                        dt.textContent = mes.send_date;
                        save();
                    });
                    actions.append(swipeLeft);
                }
                const swipe = document.createElement('div'); {
                    swipe.classList.add('stac--info');
                    swipe.textContent = `${(mes.swipe_id ?? 0) + 1} / ${(mes.swipes?.length ?? 1)}`;
                    actions.append(swipe);
                }
                const swipeRight = document.createElement('div'); {
                    swipeRight.classList.add('stac--action');
                    swipeRight.classList.add('stac--swipeRight');
                    swipeRight.classList.add('fa-solid', 'fa-chevron-right');
                    swipeRight.title = 'Show or generate next swipe\n---\nno effect on user messages, gen only works on final bot message';
                    swipeRight.addEventListener('click', async()=>{
                        if (mes.swipe_id + 1 >= (mes.swipes ?? [1]).length) {
                            if (mes.is_user) {
                                //TODO add swipe and open editor
                            } else if (history.indexOf(mes) + 1 < history.length) {
                                //TODO add swipe and open editor? gen in middle? create branch?
                            } else {
                                await swipeGen();
                            }
                        } else {
                            mes.swipe_id++;
                            mes.mes = mes.swipes[mes.swipe_id];
                            mes.extra = mes.swipe_info[mes.swipe_id].extra;
                            mes.gen_finished = mes.swipe_info[mes.swipe_id].gen_finished;
                            mes.gen_started = mes.swipe_info[mes.swipe_id].gen_started;
                            mes.send_date = mes.swipe_info[mes.swipe_id].send_date;
                            txt.innerHTML = messageFormatting(mes.mes, mes.name, mes.is_system, mes.is_user, -1);
                            swipe.textContent = `${(mes.swipe_id ?? 0) + 1} / ${(mes.swipes?.length ?? 1)}`;
                            dt.textContent = mes.send_date;
                            save();
                        }
                    });
                    actions.append(swipeRight);
                }
                const edit = document.createElement('div'); {
                    edit.classList.add('stac--action');
                    edit.classList.add('fa-solid', 'fa-pencil');
                    edit.title = 'Edit message\n---\nNOT IMPLEMENTED';
                    actions.append(edit);
                }
                details.append(actions);
            }
            root.append(details);
        }
        const txt = document.createElement('div'); {
            mesText = txt;
            txt.classList.add('stac--content');
            txt.classList.add('mes_text');
            txt.innerHTML = content;
            root.append(txt);
        }
        if (replace !== null) {
            [...dom.messages.children].slice(-1 - replace)[0].replaceWith(root);
        } else {
            dom.messages.prepend(root);
        }
    }
    return mesText;
};

const swipeGen = async()=>{
    const usedHistory = structuredClone(history);
    const oBotMes = history.slice(-1).pop();
    if (oBotMes.is_user) return;
    const oUserMes = history.slice(-2, -1).pop();
    if (!oUserMes.is_user) return;
    const text = oUserMes.mes;
    [...dom.messages.children][0].remove();
    const { userMes, botMes } = await gen(usedHistory, text, false);
    if (!oBotMes.swipes) oBotMes.swipes = [oBotMes.mes];
    if (!oBotMes.swipe_info) oBotMes.swipe_info = [{
        extra: structuredClone(oBotMes.extra),
        gen_finished: oBotMes.gen_finished,
        gen_started: oBotMes.gen_started,
        send_date: oBotMes.send_date,
    }];
    oBotMes.swipes.push(botMes.mes);
    oBotMes.swipe_info.push({
        extra: structuredClone(botMes.extra),
        gen_finished: botMes.gen_finished,
        gen_started: botMes.gen_started,
        send_date: botMes.send_date,
    });
    oBotMes.swipe_id = oBotMes.swipes.length - 1;
    oBotMes.mes = botMes.mes;
    oBotMes.extra = botMes.extra;
    oBotMes.gen_finished = botMes.gen_finished;
    oBotMes.gen_started = botMes.gen_started;
    oBotMes.send_date = botMes.send_date;
    makeMessage(oBotMes, ()=>{
        if (!oBotMes) return;
        history.splice(history.indexOf(oBotMes), 1);
        save();
    }, -1);
    save();
};
const send = async(text)=>{
    text = text.trim();
    const usedHistory = structuredClone(history);
    let hasUserMes = true;
    if (text.length == 0) {
        if (history.length == 0) return;
        const userMes = usedHistory.pop();
        if (!userMes.is_user) return;
        hasUserMes = false;
        text = userMes.mes;
    }
    const { userMes, botMes } = await gen(usedHistory, text, hasUserMes);
    if (hasUserMes) {
        history.push(userMes);
        makeMessage(userMes, ()=>{
            if (!userMes) return;
            history.splice(history.indexOf(userMes), 1);
            save();
        }, -2);
    }
    history.push(botMes);
    makeMessage(botMes, ()=>{
        if (!botMes) return;
        history.splice(history.indexOf(botMes), 1);
        save();
    }, -1);
    save();
};

const gen = async(history, userText, hasUserMes)=>{
    if (settings.scriptBefore.length > 1 && settings.scriptBefore[0] == '/') {
        await executeSlashCommandsWithOptions(settings.scriptBefore, {
            handleExecutionErrors: true,
            handleParserErrors: true,
            source: 'chatchat-before',
        });
    }
    await saveChatConditional();
    // const oChar = this_chid;
    // setCharacterId(characters.findIndex(it=>it.avatar == settings.character));
    const style = document.createElement('style');
    style.innerHTML = `
        #chat .mes {
            &[mesid="${chat.length}"], &[mesid="${chat.length + 1}"] {
                display: none;
            }
        }
    `;
    document.body.append(style);
    const chatClone = structuredClone(chat);
    const story = [];
    for (const mes of chat) {
        if (mes.is_system) continue;
        if (isRole(mes, ['assistant'])) {
            story.push(getRegexedString(mes.mes, regex_placement.AI_OUTPUT, { isPrompt: true }));
        }
        mes.is_system = true;
    }
    settings.injectList.forEach(({ text, type, depth, scan, role },idx)=>setExtensionPrompt(
        `chatchat-user-${idx}`,
        text,
        type,
        depth,
        scan,
        role,
    ));
    setExtensionPrompt(
        'chatchat-content',
        `<story>${story.join('\n')}</story>`,
        extension_prompt_types.IN_CHAT,
        settings.storyPosition == STORY_POSITION.BEFORE_CHAT ? history.length + 1 : settings.storyDepth,
        true,
        extension_prompt_roles.SYSTEM,
    );
    const historyInjects = [];
    for (const h of history) {
        const id = `chatchat-history-${historyInjects.length}`;
        const args = [
            id,
            h.mes,
            extension_prompt_types.IN_CHAT,
            history.length - historyInjects.length + 1,
            true,
            isRole(h, ['user']) ? extension_prompt_roles.USER : extension_prompt_roles.ASSISTANT,
        ];
        historyInjects.push(args);
        setExtensionPrompt(args[0], args[1], args[2], args[3], args[4], args[5]);
    }
    await sendMessageAsUser(userText, null);
    const userMes = structuredClone(chat.slice(-1)[0]);
    history.push(userMes);
    if (hasUserMes) {
        makeMessage(chat.slice(-1)[0], ()=>{
            history.splice(history.indexOf(userMes), 1);
            save();
        });
    }
    let botMes;
    let botContent = makeMessage({ mes:'...', is_user:false, send_date:'' }, ()=>{
        if (!botMes) return;
        history.splice(history.indexOf(botMes), 1);
        save();
    });
    const idx = chat.length;
    let isDone = false;
    const prom = Generate('normal').then(()=>isDone = true);
    let mes;
    let mo;
    while (!isDone && !mes) {
        mes = document.querySelector(`#chat .mes[mesid="${idx}"] .mes_text`);
        if (mes) {
            botContent.innerHTML = mes.innerHTML;
            mo = new MutationObserver(()=>botContent.innerHTML = mes.innerHTML);
            mo.observe(mes, { characterData:true, childList:true, subtree:true });
        }
        await delay(100);
    }
    await prom;
    botMes = structuredClone(chat.slice(-1)[0]);
    makeMessage(botMes, ()=>{
        if (!botMes) return;
        history.splice(history.indexOf(botMes), 1);
        save();
    }, history.length);
    history.push(botMes);
    chat.splice(0, chatClone.length, ...chatClone);
    await executeSlashCommandsWithOptions(`/cut ${chat.length - 2}-{{lastMessageId}}`);
    style.remove();
    settings.injectList.forEach(({ text, position, depth, scan, role },idx)=>setExtensionPrompt(
        `chatchat-user-${idx}`,
        '',
        position,
        depth,
        scan,
        role,
    ));
    setExtensionPrompt(
        'chatchat-content',
        '',
        extension_prompt_types.IN_CHAT,
        1,
        true,
        extension_prompt_roles.SYSTEM,
    );
    for (const h of historyInjects) {
        setExtensionPrompt(h[0], '', h[2], h[3], h[4], h[5]);
    }
    // setCharacterId(oChar);
    if (settings.scriptAfter.length > 1 && settings.scriptAfter[0] == '/') {
        await executeSlashCommandsWithOptions(settings.scriptAfter, {
            handleExecutionErrors: true,
            handleParserErrors: true,
            source: 'chatchat-after',
        });
    }
    return { userMes, botMes };
};

const loadSettings = ()=>{
    settings = new Settings();
};

const init = async()=>{
    loadSettings();
    const trigger = document.createElement('div'); {
        trigger.classList.add('stac--trigger');
        trigger.classList.add('fa', 'fa-solid', 'fa-comment-alt');
        trigger.title = 'Click to toggle ChatChat\nRight-click to open settings';
        trigger.addEventListener('click', ()=>{
            if (panel.classList.toggle('stac--active')) {
                dom.input.focus();
            } else {
                dom.input.blur();
            }
        });
        trigger.addEventListener('contextmenu', async(evt)=>{
            evt.preventDefault();
            settings.hide();
            settings.load();
            settings.registerSettings();
            await settings.init();
            settings.show();
        });
        document.body.append(trigger);
    }
    const panel = document.createElement('div'); {
        panel.classList.add('stac--panel');
        const head = document.createElement('div'); {
            head.classList.add('stac--head');
            panel.append(head);
        }
        const messages = document.createElement('div'); {
            dom.messages = messages;
            messages.classList.add('stac--messages');
            panel.append(messages);
        }
        const form = document.createElement('div'); {
            form.classList.add('stac--form');
            const inp = document.createElement('div'); {
                dom.input = inp;
                inp.contentEditable = 'plaintext-only';
                inp.classList.add('stac--input');
                inp.classList.add('text_pole');
                // inp.setAttribute('placeholder', 'Ask questions');
                // inp.rows = 3;
                inp.addEventListener('keydown', async(evt)=>{
                    evt.stopPropagation();
                    if (!evt.shiftKey && !evt.ctrlKey && !evt.altKey && evt.key == 'ArrowRight') {
                        if (document.activeElement == inp && inp.textContent == '') {
                            dom.messages.children[0]?.querySelector('.stac--swipeRight')?.click();
                        }
                        return;
                    }
                    if (!evt.shiftKey && !evt.ctrlKey && !evt.altKey && evt.key == 'ArrowLeft') {
                        if (document.activeElement == inp && inp.textContent == '') {
                            dom.messages.children[0]?.querySelector('.stac--swipeLeft')?.click();
                        }
                        return;
                    }
                    if (evt.shiftKey || evt.ctrlKey || evt.altKey || evt.key != 'Enter') return;
                    evt.preventDefault();
                    const text = dom.input.textContent;
                    dom.input.textContent = '';
                    await send(text);
                    dom.input.focus();
                });
                form.append(inp);
            }
            panel.append(form);
        }
        document.body.append(panel);
    }
    panel.style.setProperty('--fontSize', settings.fontSize.toString());
    panel.classList[settings.widthType == WIDTH_TYPE.SCREEN ? 'add' : 'remove']('stac--unlocked');
    panel.style.setProperty('--width', settings.width.toString());
    panel.style.setProperty('--userColorBg', settings.userColorBg.toString());
    panel.style.setProperty('--userColorText', settings.userColorText.toString());
    panel.style.setProperty('--botColorBg', settings.botColorBg.toString());
    panel.style.setProperty('--botColorText', settings.botColorText.toString());
    onChatChanged();
    eventSource.on(event_types.CHAT_CHANGED, ()=>onChatChanged());
};
eventSource.on(event_types.APP_READY, ()=>init());
