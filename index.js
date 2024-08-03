import { chat, chat_metadata, event_types, eventSource, extension_prompt_roles, extension_prompt_types, Generate, messageFormatting, saveChatConditional, sendMessageAsUser, setExtensionPrompt, system_message_types } from '../../../../script.js';
import { saveMetadataDebounced } from '../../../extensions.js';
import { executeSlashCommandsWithOptions } from '../../../slash-commands.js';
import { delay } from '../../../utils.js';
import { getRegexedString, regex_placement } from '../../regex/engine.js';
import { Chat } from './src/Chat.js';
import { waitForFrame } from './src/lib/wait.js';
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



const chatList = [new Chat()];
let chatIndex = 0;
let currentChat = chatList[0];
const dom = {
    /**@type {HTMLElement} */
    messages: undefined,
    /**@type {HTMLElement} */
    input: undefined,
};
export const initMetadata = ()=>{
    if (!chat_metadata.chatchat) chat_metadata.chatchat = {};
    if (!chat_metadata.chatchat.settings) chat_metadata.chatchat.settings = {};
    if (!chat_metadata.chatchat.chatList) {
        chat_metadata.chatchat.chatList = [new Chat()];
        chat_metadata.chatchat.chatIndex = 0;
        if (chat_metadata.chatchat.history) {
            chat_metadata.chatchat.chatList[0].messageList = chat_metadata.chatchat.history;
        }
    } else if (!chat_metadata.chatchat.chatIndex) {
        chat_metadata.chatchat.chatIndex = 0;
    }
    chat_metadata.chatchat.chatList.forEach((it,idx)=>{
        if (!(it instanceof Chat)) chat_metadata.chatchat.chatList[idx] = Chat.from(it);
    });
};
const save = ()=>{
    initMetadata();
    chat_metadata.chatchat.chatList[chatIndex] = currentChat;
    chat_metadata.chatchat.chatIndex = chatIndex;
    saveMetadataDebounced();
};
const onChatChanged = async()=>{
    settings.hide();
    settings.load();
    settings.registerSettings();
    await settings.init();
    initMetadata();
    while(chatList.pop());
    chatList.push(...chat_metadata.chatchat.chatList);
    chatIndex = chat_metadata.chatchat.chatIndex;
    currentChat = chatList[chatIndex];
    reloadChat();
};
const reloadChat = async()=>{
    dom.messages.innerHTML = '';
    for (const mes of currentChat.messageList) {
        makeMessage(mes, ()=>{
            currentChat.messageList.splice(currentChat.messageList.indexOf(mes), 1);
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
                const copy = document.createElement('div'); {
                    copy.classList.add('stac--action');
                    copy.classList.add('fa-solid', 'fa-copy');
                    copy.title = 'Copy message text';
                    copy.addEventListener('click', async()=>{
                        let ok = false;
                        try {
                            navigator.clipboard.writeText(mes.mes.toString());
                            ok = true;
                        } catch {
                            console.warn('/copy cannot use clipboard API, falling back to execCommand');
                            const ta = document.createElement('textarea'); {
                                ta.value = mes.mes.toString();
                                ta.style.position = 'fixed';
                                ta.style.inset = '0';
                                document.body.append(ta);
                                ta.focus();
                                ta.select();
                                try {
                                    document.execCommand('copy');
                                    ok = true;
                                } catch (err) {
                                    console.error('Unable to copy to clipboard', err);
                                }
                                ta.remove();
                            }
                        }
                        copy.classList.add(`stac--${ok ? 'success' : 'failure'}`);
                        await delay(1000);
                        copy.classList.remove(`stac--${ok ? 'success' : 'failure'}`);
                    });
                    actions.append(copy);
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
                    swipeRight.title = 'Show or generate next swipe\n---\nonly works on user messages (=edit new) and on final bot message (=gen new)';
                    swipeRight.addEventListener('click', async()=>{
                        if (mes.swipe_id + 1 >= (mes.swipes ?? [1]).length) {
                            if (mes.is_user) {
                                // add swipe and open editor
                                addSwipe(mes, {
                                    mes: '',
                                    extra: {},
                                    gen_finished: new Date().toLocaleString(),
                                    gen_started: new Date().toLocaleString(),
                                    send_date: new Date().toLocaleString(),
                                });
                                txt.innerHTML = messageFormatting(mes.mes, mes.name, mes.is_system, mes.is_user, -1);
                                swipe.textContent = `${(mes.swipe_id ?? 0) + 1} / ${(mes.swipes?.length ?? 1)}`;
                                dt.textContent = mes.send_date;
                                edit.click();
                            } else if (currentChat.messageList.indexOf(mes) + 1 < currentChat.messageList.length) {
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
                    edit.title = 'Edit message';
                    let isEditing = false;
                    /**@type {HTMLElement} */
                    let editor;
                    edit.addEventListener('click', ()=>{
                        if (!isEditing) {
                            isEditing = true;
                            editor = document.createElement('div'); {
                                editor.classList.add('stac--editor');
                                editor.classList.add('stac--content');
                                editor.classList.add('mes_text');
                                editor.contentEditable = 'plaintext-only';
                                editor.textContent = mes.mes;
                                editor.addEventListener('keydown', (evt)=>evt.stopPropagation());
                                txt.replaceWith(editor);
                                editor.focus();
                            }
                        } else {
                            mes.mes = editor.textContent;
                            if (mes.swipes) mes.swipes[mes.swipe_id ?? 0] = mes.mes;
                            txt.innerHTML = messageFormatting(mes.mes, mes.name, mes.is_system, mes.is_user, -1);
                            editor.replaceWith(txt);
                            editor = null;
                            save();
                            isEditing = false;
                        }
                    });
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

const initSwipes = (mes)=>{
    if (!mes.swipes) mes.swipes = [mes.mes];
    if (!mes.swipe_info) mes.swipe_info = [{
        extra: structuredClone(mes.extra),
        gen_finished: mes.gen_finished,
        gen_started: mes.gen_started,
        send_date: mes.send_date,
    }];
};
const addSwipe = (mes, newMes)=>{
    initSwipes(mes);
    mes.swipes.push(newMes.mes);
    mes.swipe_info.push({
        extra: structuredClone(newMes.extra),
        gen_finished: newMes.gen_finished,
        gen_started: newMes.gen_started,
        send_date: newMes.send_date,
    });
    mes.swipe_id = mes.swipes.length - 1;
    mes.mes = newMes.mes;
    mes.extra = newMes.extra;
    mes.gen_finished = newMes.gen_finished;
    mes.gen_started = newMes.gen_started;
    mes.send_date = newMes.send_date;
};
const swipeGen = async()=>{
    const usedHistory = structuredClone(currentChat.messageList);
    const oBotMes = currentChat.messageList.slice(-1).pop();
    usedHistory.pop();
    if (oBotMes.is_user) return;
    const oUserMes = currentChat.messageList.slice(-2, -1).pop();
    if (!oUserMes.is_user) return;
    const text = oUserMes.mes;
    [...dom.messages.children][0].remove();
    const { userMes, botMes } = await gen(usedHistory, text, false);
    addSwipe(oBotMes, botMes);
    makeMessage(oBotMes, ()=>{
        if (!oBotMes) return;
        currentChat.messageList.splice(currentChat.messageList.indexOf(oBotMes), 1);
        save();
    }, -1);
    save();
};
const send = async(text)=>{
    text = text.trim();
    const usedHistory = structuredClone(currentChat.messageList);
    let hasUserMes = true;
    if (text.length == 0) {
        if (currentChat.messageList.length == 0) return;
        const userMes = usedHistory.pop();
        if (!userMes.is_user) return;
        hasUserMes = false;
        text = userMes.mes;
    }
    const { userMes, botMes } = await gen(usedHistory, text, hasUserMes);
    if (hasUserMes) {
        currentChat.messageList.push(userMes);
        makeMessage(userMes, ()=>{
            if (!userMes) return;
            currentChat.messageList.splice(currentChat.messageList.indexOf(userMes), 1);
            save();
        }, -2);
    }
    currentChat.messageList.push(botMes);
    makeMessage(botMes, ()=>{
        if (!botMes) return;
        currentChat.messageList.splice(currentChat.messageList.indexOf(botMes), 1);
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
        settings.storyPosition == STORY_POSITION.BEFORE_CHAT ? history.length + 2 : settings.storyDepth,
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
    mo.disconnect();
    botMes = structuredClone(chat.slice(-1)[0]);
    dom.messages.children[0].querySelector('.stac--date').textContent = botMes.send_date;
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
        trigger.title = 'Click to toggle ChatChat\nRight-click for settings and chat management';
        trigger.addEventListener('click', ()=>{
            if (panel.classList.toggle('stac--active')) {
                dom.input.focus();
            } else {
                dom.input.blur();
            }
        });
        let menu;
        const hide = async()=>{
            menu.classList.remove('stac--active');
            await delay(410);
            menu.remove();
            menu = null;
            trigger.classList.remove('stac--hasMenu');
        };
        trigger.addEventListener('contextmenu', async(evt)=>{
            evt.preventDefault();
            if (menu) return hide();
            trigger.classList.add('stac--hasMenu');
            menu = document.createElement('div'); {
                menu.classList.add('stac--menu');
                const settingsItem = document.createElement('div'); {
                    settingsItem.classList.add('stac--item');
                    settingsItem.classList.add('stac--settings');
                    const icon = document.createElement('div'); {
                        icon.classList.add('stac--icon');
                        icon.classList.add('fa-solid', 'fa-cog');
                        settingsItem.append(icon);
                    }
                    const label = document.createElement('div'); {
                        label.classList.add('stac--label');
                        label.textContent = 'Settings';
                        settingsItem.append(label);
                    }
                    settingsItem.addEventListener('click', async()=>{
                        hide();
                        settings.hide();
                        settings.load();
                        settings.registerSettings();
                        await settings.init();
                        settings.show();
                    });
                    menu.append(settingsItem);
                }
                const delChat = document.createElement('div'); {
                    delChat.classList.add('stac--item');
                    delChat.classList.add('stac--delChat');
                    const icon = document.createElement('div'); {
                        icon.classList.add('stac--icon');
                        icon.classList.add('fa-solid', 'fa-trash-can');
                        delChat.append(icon);
                    }
                    const label = document.createElement('div'); {
                        label.classList.add('stac--label');
                        label.textContent = 'Delete current chat';
                        delChat.append(label);
                    }
                    delChat.addEventListener('click', async()=>{
                        hide();
                        chatList.splice(chatIndex, 1);
                        if (chatList.length > chatIndex) {
                            // keep index, show next chat
                        } else if (chatList.length > 0) {
                            // show prev chat
                            chatIndex--;
                        } else {
                            // add new empty chat
                            const nc = new Chat();
                            chatList.push(nc);
                        }
                        currentChat = chatList[chatIndex];
                        save();
                        reloadChat();
                    });
                    menu.append(delChat);
                }
                const newChat = document.createElement('div'); {
                    newChat.classList.add('stac--item');
                    newChat.classList.add('stac--newChat');
                    const icon = document.createElement('div'); {
                        icon.classList.add('stac--icon');
                        icon.classList.add('fa-solid', 'fa-comment-medical');
                        newChat.append(icon);
                    }
                    const label = document.createElement('div'); {
                        label.classList.add('stac--label');
                        label.textContent = 'Start new chat';
                        newChat.append(label);
                    }
                    newChat.addEventListener('click', async()=>{
                        hide();
                        const nc = new Chat();
                        chatList.push(nc);
                        chatIndex++;
                        currentChat = nc;
                        save();
                        reloadChat();
                    });
                    menu.append(newChat);
                }
                for (const c of chatList.toSorted((a,b)=>b.lastChatOn - a.lastChatOn)) {
                    const item = document.createElement('div'); {
                        item.classList.add('stac--item');
                        item.classList.add('stac--chat');
                        if (c == currentChat) item.classList.add('stac--current');
                        const icon = document.createElement('div'); {
                            icon.classList.add('stac--icon');
                            icon.classList.add('fa-solid', 'fa-comments');
                            item.append(icon);
                        }
                        const label = document.createElement('div'); {
                            label.classList.add('stac--label');
                            label.textContent = `${c.title} (${c.messageList.length}) - ${new Date(c.lastChatOn).toLocaleString()}`;
                            item.append(label);
                        }
                        item.addEventListener('click', async()=>{
                            hide();
                            chatList.indexOf(c);
                            currentChat = c;
                            save();
                            reloadChat();
                        });
                        menu.append(item);
                    }
                }
                await waitForFrame();
                document.body.append(menu);
                await waitForFrame();
                menu.classList.add('stac--active');
            }
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
    eventSource.on(event_types.CHAT_CHANGED, ()=>(onChatChanged(), null));
};
eventSource.on(event_types.APP_READY, ()=>init());
