import { chat, chat_metadata, event_types, eventSource, extension_prompt_roles, extension_prompt_types, Generate, saveChatConditional, sendMessageAsUser, setExtensionPrompt, system_message_types, this_chid } from '../../../../script.js';
import { saveMetadataDebounced } from '../../../extensions.js';
import { Popup, POPUP_TYPE } from '../../../popup.js';
import { executeSlashCommandsWithOptions } from '../../../slash-commands.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { getTokenCountAsync } from '../../../tokenizers.js';
import { delay } from '../../../utils.js';
import { getRegexedString, regex_placement } from '../../regex/engine.js';
import { groupId } from '../SillyTavern-TriggerCards/index.js';
import { Chat } from './src/Chat.js';
import { waitForFrame } from './src/lib/wait.js';
import { Message } from './src/Message.js';
import { Settings, STORY_POSITION, WIDTH_TYPE } from './src/Settings.js';


/**@type {Settings} */
export let settings;


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
//TODO context limit
//TODO message context menu
//x swipes
//x edit
//x chat title
//x auto scroll
//x new convo (while saving the old one)
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



/**
 * @param {Chat} nc
 */
const hookChat = (nc)=>{
    nc.onChange = ()=>save();
    nc.onGenerate = async()=>{
        const usedHistory = currentChat.toFlat();
        if (usedHistory.length < 2) return;
        const bm = nc.leafMessage;
        bm.character = settings.character;
        usedHistory.pop();
        const um = usedHistory.pop();
        if (!um.isUser) return;
        const text = um.text;
        // eslint-disable-next-line no-unused-vars
        const { userMes:_, botMes } = await gen(usedHistory, text, bm);
        bm.update(botMes);
        save();
    };
};
const addChat = ()=>{
    const nc = new Chat();
    hookChat(nc);
    chatList.push(nc);
    return nc;
};
/**@type {Chat[]} */
const chatList = []; {
    addChat();
}
let chatIndex = 0;
let currentChat = chatList[0];
const dom = {
    /**@type {HTMLElement} */
    trigger: undefined,
    /**@type {HTMLElement} */
    panel: undefined,
    /**@type {HTMLElement} */
    head: undefined,
    /**@type {HTMLElement} */
    messages: undefined,
    /**@type {HTMLElement} */
    form: undefined,
    /**@type {HTMLElement} */
    input: undefined,
    /**@type {HTMLElement} */
    historyBtn: undefined,
};
export const initMetadata = ()=>{
    if (!chat_metadata.chatchat) chat_metadata.chatchat = {};
    if (!chat_metadata.chatchat.settings) chat_metadata.chatchat.settings = {};
    if (!chat_metadata.chatchat.chatList) {
        chat_metadata.chatchat.chatList = []; {
            const nc = new Chat();
            hookChat(nc);
            chat_metadata.chatchat.chatList.push(nc);
        }
        chat_metadata.chatchat.chatIndex = 0;
        if (chat_metadata.chatchat.history) {
            chat_metadata.chatchat.chatList[0].messageList = chat_metadata.chatchat.history;
        }
    } else if (!chat_metadata.chatchat.chatIndex) {
        chat_metadata.chatchat.chatIndex = 0;
    }
    chat_metadata.chatchat.chatList.forEach((it,idx)=>{
        if (!(it instanceof Chat)) {
            const nc = Chat.from(it);
            hookChat(nc);
            chat_metadata.chatchat.chatList[idx] = nc;
        }
    });
};
const save = ()=>{
    initMetadata();
    chat_metadata.chatchat.chatList = chatList;
    chat_metadata.chatchat.chatIndex = chatIndex;
    saveMetadataDebounced();
};
const onChatChanged = async()=>{
    console.log('[STAC]', 'onChatChanged');
    settings.hide();
    settings.load();
    settings.registerSettings();
    await settings.init();
    initMetadata();
    while(chatList.pop());
    chatList.push(...chat_metadata.chatchat.chatList);
    if (chatList.length == 0) {
        addChat();
    }
    chatIndex = chat_metadata.chatchat.chatIndex;
    currentChat = chatList[chatIndex];
    reloadChat();
    if ((this_chid === null || this_chid === undefined) && (groupId === null || groupId === undefined)) {
        document.body.classList.add('stac--nochat');
        hideMenu();
        hideHistoryMenu();
    } else {
        document.body.classList.remove('stac--nochat');
    }
};
const updateHeadLoop = async()=>{
    let oldText;
    while (true) {
        const story = chat.filter(mes=>!mes.is_system && isRole(mes, ['assistant']));
        const storyText = getRegexedString(story.map(it=>it.mes).join('\n'), regex_placement.AI_OUTPUT, { isPrompt: true })
        if (oldText != storyText) {
            updateHead(story, storyText);
            oldText = storyText;
        }
        await delay(500);
    }
};
const updateHead = async(story, storyText)=>{
    const seg = new Intl.Segmenter('en', { granularity:'sentence' });
    dom.head.innerHTML = '';
    story ??= chat.filter(mes=>!mes.is_system && isRole(mes, ['assistant']));
    storyText ??= getRegexedString(story.map(it=>it.mes).join('\n'), regex_placement.AI_OUTPUT, { isPrompt: true })
    const first = getRegexedString(story[0].mes, regex_placement.AI_OUTPUT, { isPrompt: true });
    const last = getRegexedString(story.slice(-1)[0].mes, regex_placement.AI_OUTPUT, { isPrompt: true });
    if (story.length > 0) {
        const start = document.createElement('div'); {
            start.classList.add('stac--start');
            start.textContent = first;
            dom.head.append(start);
        }
        const end = document.createElement('div'); {
            end.classList.add('stac--end');
            end.textContent = last;
            end.innerHTML += '&lrm;';
            dom.head.append(end);
        }
    }
    const segFirst = [...seg.segment(first)];
    const segLast = [...seg.segment(last)];
    dom.head.title = [
        `Story: Message #${0} to #${chat.length - 1}  (~${await getTokenCountAsync(storyText)} tokens) | ${settings.sectionList.length ? `${settings.sectionList.length + 1} sections` : null}`,
        '---',
        segFirst.slice(0, 4).map(it=>it.segment.trim()).join(' '),
        '[...]',
        segLast.slice(-4).map(it=>it.segment.trim()).join(' '),
    ].filter(it=>it).join('\n');
};
const reloadChat = async()=>{
    updateHead();
    currentChat.render(dom.messages);
};
const send = async(text)=>{
    text = text.trim();
    const usedHistory = currentChat.toFlat();
    let hasUserMes = true;
    let um;
    if (text.length == 0) {
        if (usedHistory.length == 0) return;
        const userMes = usedHistory.pop();
        if (!userMes.isUser) return;
        hasUserMes = false;
        text = userMes.text;
    } else {
        settings.inputHistory.unshift(text);
        settings.inputHistory = settings.inputHistory.filter((it,idx,list)=>idx == list.indexOf(it));
        while (settings.inputHistory.length > settings.maxInputHistory) settings.inputHistory.pop();
        settings.save();
        um = Message.fromText(text);
        um.isUser = true;
        currentChat.addMessage(um);
    }
    const bm = Message.fromText('...');
    bm.isUser = false;
    bm.character = settings.character;
    currentChat.addMessage(bm);
    const { userMes, botMes } = await gen(usedHistory, text, bm);
    if (hasUserMes) {
        um.update(userMes);
    }
    bm.update(botMes);
    save();
};

const getSections = (history)=>{
    history ??= chat;
    const story = history.filter(mes=>!mes.is_system && isRole(mes, ['assistant']));
    const storyText = getRegexedString(story.map(it=>it.mes).join('\n'), regex_placement.AI_OUTPUT, { isPrompt: true })
    const sections = [];
    const sectionIndex = [0];
    while (sections.length) sections.pop();
    while (sectionIndex.length > 1) sectionIndex.pop();
    for (const sep of settings.sectionList) {
        const lastIdx = sectionIndex.slice(-1)[0];
        const remaining = storyText.slice(lastIdx);
        const idx = remaining.indexOf(sep);
        sectionIndex.push(lastIdx + idx);
        sections.push(storyText.slice(...sectionIndex.slice(-2)));
    }
    sections.push(storyText.slice(sectionIndex.slice(-1)[0]));
    return sections;
};

/**
 *
 * @param {Message[]} history
 * @param {string} userText
 * @param {Message} bm
 * @returns {Promise<{ userMes:import('./src/Message.js').ChatMessage, botMes:import('./src/Message.js').ChatMessage }>}
 */
const gen = async(history, userText, bm)=>{
    if (settings.scriptBefore.length > 1 && settings.scriptBefore[0] == '/') {
        await executeSlashCommandsWithOptions(settings.scriptBefore, {
            handleExecutionErrors: true,
            handleParserErrors: true,
            source: 'chatchat-before',
        });
    }
    await saveChatConditional();
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
    // const story = [];
    const sections = getSections(chat);
    let story = '';
    if (sections.length == 1) {
        story = sections[0];
    } else if (sections.length > 1) {
        story = sections.map((it,idx)=>`<Section-${idx + 1}>\n${it}\n</Section-${idx + 1}>`).join('\n');
    }
    for (const mes of chat) {
        //TODO use getTokenCountAsync('...') to limit tokens
        if (mes.is_system) continue;
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
        `<Story>${story}</Story>`,
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
            h.text,
            extension_prompt_types.IN_CHAT,
            history.length - historyInjects.length + 1,
            true,
            h.isUser ? extension_prompt_roles.USER : extension_prompt_roles.ASSISTANT,
        ];
        historyInjects.push(args);
        setExtensionPrompt(args[0], args[1], args[2], args[3], args[4], args[5]);
    }
    await sendMessageAsUser(userText, null);
    const userMes = structuredClone(chat.slice(-1)[0]);
    let botMes;
    const idx = chat.length;
    let isDone = false;
    let mo;
    try {
        const prom = Generate('normal').then(()=>isDone = true);
        let mes;
        while (!isDone && !mes) {
            mes = document.querySelector(`#chat .mes[mesid="${idx}"] .mes_text`);
            if (mes) {
                mo = new MutationObserver(()=>bm.updateContent(mes.innerHTML));
                mo.observe(mes, { characterData:true, childList:true, subtree:true });
            }
            await delay(100);
        }
        await prom;
    } catch (ex) {
        console.error('[STAC]', ex);
        toastr.error(ex.message, 'ChatChat');
    }
    mo?.disconnect();
    botMes = structuredClone(chat.slice(-1)[0]);
    dom.messages.children[0].querySelector('.stac--date').textContent = botMes.send_date;
    chat.splice(0, chatClone.length, ...chatClone);
    await executeSlashCommandsWithOptions(`/cut ${chatClone.length}-{{lastMessageId}}`);
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


let menu;
const hideMenu = async()=>{
    if (!menu) return;
    menu.classList.remove('stac--active');
    await delay(410);
    menu.remove();
    menu = null;
    dom.trigger.classList.remove('stac--hasMenu');
};
const showMenu = async()=>{
    if (menu) return hideMenu();
    dom.trigger.classList.add('stac--hasMenu');
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
                hideMenu();
                settings.hide();
                settings.load();
                settings.registerSettings();
                await settings.init();
                settings.show();
            });
            menu.append(settingsItem);
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
                hideMenu();
                const nc = addChat();
                chatIndex++;
                currentChat = nc;
                save();
                reloadChat();
                dom.panel.classList.add('stac--active');
                dom.input.focus();
            });
            menu.append(newChat);
        }
        const renderItem = (c)=>{
            let titleEl;
            const item = document.createElement('div'); {
                item.classList.add('stac--item');
                item.classList.add('stac--chat');
                if (c == currentChat) item.classList.add('stac--current');
                const titleParts = [
                    c.rootMessage?.text?.split('\n')?.filter(it=>it.length)?.[0],
                    '...',
                    c.leafMessage?.text?.split('\n')?.filter(it=>it.length)?.slice(-1)?.[0],
                ].filter(it=>it);
                if (titleParts.length > 1) {
                    item.title = titleParts.join('\n');
                } else {
                    item.title = 'No messages';
                }
                const icon = document.createElement('div'); {
                    icon.classList.add('stac--icon');
                    icon.classList.add('fa-solid', 'fa-comments');
                    item.append(icon);
                }
                const label = document.createElement('div'); {
                    label.classList.add('stac--label');
                    const content = document.createElement('div'); {
                        content.classList.add('stac--content');
                        const title = document.createElement('div'); {
                            titleEl = title;
                            title.classList.add('stac--title');
                            title.textContent = c.title;
                            content.append(title);
                        }
                        const meta = document.createElement('div'); {
                            meta.classList.add('stac--meta');
                            const count = document.createElement('div'); {
                                count.classList.add('stac--count');
                                const icon = document.createElement('i'); {
                                    icon.classList.add('stac--icon');
                                    icon.classList.add('fa-solid', 'fa-fw', 'fa-comment');
                                    count.append(icon);
                                }
                                count.append(c.messageCount.toString());
                                meta.append(count);
                            }
                            const dt = document.createElement('div'); {
                                dt.classList.add('stac--date');
                                const icon = document.createElement('i'); {
                                    icon.classList.add('stac--icon');
                                    icon.classList.add('fa-solid', 'fa-fw', 'fa-calendar-alt');
                                    dt.append(icon);
                                }
                                dt.append(`${c.firstMessageOn} - ${c.lastMessageOn}`);
                                meta.append(dt);
                            }
                            content.append(meta);
                        }
                        label.append(content);
                    }
                    const actions = document.createElement('div'); {
                        actions.classList.add('stac--actions');
                        const del = document.createElement('div'); {
                            del.classList.add('stac--action');
                            del.classList.add('menu_button');
                            del.classList.add('fa-solid', 'fa-fw', 'fa-trash-can');
                            del.title = 'Delete chat\n---\nNo warning, no confirm. When it\'s gone it\'s gone...';
                            del.addEventListener('click', (evt)=>{
                                evt.stopPropagation();
                                let isCurrent = currentChat == c;
                                chatList.splice(chatList.indexOf(c), 1);
                                if (isCurrent) {
                                    if (chatList.length > chatIndex) {
                                        // keep index, show next chat
                                        currentChat = chatList[chatIndex];
                                        item.previousElementSibling.classList.add('stac--current');
                                    } else if (chatList.length > 0) {
                                        // show prev chat
                                        chatIndex--;
                                        currentChat = chatList[chatIndex];
                                        item.nextElementSibling.classList.add('stac--current');
                                    } else {
                                        // add new empty chat
                                        const nc = addChat();
                                        currentChat = nc;
                                        renderItem(nc);
                                    }
                                } else {
                                    chatIndex = chatList.indexOf(currentChat);
                                }
                                item.style.height = `${item.getBoundingClientRect().height}px`;
                                waitForFrame().then(async()=>{
                                    item.classList.add('stac--remove');
                                    item.style.height = '0';
                                    await delay(410);
                                    item.remove();
                                });
                                save();
                                if (isCurrent) {
                                    reloadChat();
                                }
                            });
                            actions.append(del);
                        }
                        const rename = document.createElement('div'); {
                            rename.classList.add('stac--action');
                            rename.classList.add('menu_button');
                            rename.classList.add('fa-solid', 'fa-fw', 'fa-pencil');
                            rename.title = 'Rename chat';
                            rename.addEventListener('click', (evt)=>{
                                evt.stopPropagation();
                                titleEl.contentEditable = 'plaintext-only';
                                titleEl.focus();
                                const range = document.createRange();
                                range.selectNodeContents(titleEl);
                                const sel = window.getSelection();
                                sel.removeAllRanges();
                                sel.addRange(range);
                                const listener = (evt)=>{
                                    evt.stopPropagation();
                                    if (evt.shiftKey || evt.altKey || evt.ctrlKey || evt.key != 'Enter') return;
                                    titleEl.removeEventListener('keydown', listener);
                                    titleEl.removeAttribute('contenteditable');
                                    c.title = titleEl.textContent;
                                    save();
                                };
                                titleEl.addEventListener('keydown', listener);
                            });
                            actions.append(rename);
                        }
                        label.append(actions);
                    }
                    item.append(label);
                }
                item.addEventListener('click', async()=>{
                    hideMenu();
                    chatIndex = chatList.indexOf(c);
                    currentChat = c;
                    save();
                    reloadChat();
                    dom.panel.classList.add('stac--active');
                    dom.input.focus();
                });
                menu.append(item);
            }
        };
        for (const c of chatList.toSorted((a,b)=>b.lastChatOn - a.lastChatOn)) {
            renderItem(c);
        }
        await waitForFrame();
        document.body.append(menu);
        await waitForFrame();
        menu.classList.add('stac--active');
    }
};

let historyMenu;
const hideHistoryMenu = async()=>{
    if (!historyMenu) return;
    historyMenu.classList.remove('stac--active');
    await delay(410);
    historyMenu.remove();
    historyMenu = null;
    dom.historyBtn.classList.remove('stac--hasMenu');
};
const showHistoryMenu = async()=>{
    if (historyMenu) return hideHistoryMenu();
    dom.historyBtn.classList.add('stac--hasMenu');
    historyMenu = document.createElement('div'); {
        historyMenu.classList.add('stac--history');
        const renderItem = (c)=>{
            const item = document.createElement('div'); {
                item.classList.add('stac--item');
                item.title = c;
                const icon = document.createElement('div'); {
                    icon.classList.add('stac--icon');
                    icon.classList.add('fa-solid', 'fa-comment');
                    item.append(icon);
                }
                const label = document.createElement('div'); {
                    label.classList.add('stac--label');
                    const content = document.createElement('div'); {
                        content.classList.add('stac--content');
                        const title = document.createElement('div'); {
                            title.classList.add('stac--title');
                            title.textContent = c;
                            content.append(title);
                        }
                        label.append(content);
                    }
                    item.append(label);
                }
                item.addEventListener('click', async()=>{
                    hideHistoryMenu();
                    dom.input.textContent = c;
                    dom.input.focus();
                });
                historyMenu.append(item);
            }
        };
        for (const c of settings.inputHistory) {
            renderItem(c);
        }
        await waitForFrame();
        dom.form.append(historyMenu);
        await waitForFrame();
        historyMenu.classList.add('stac--active');
    }
};


const init = async()=>{
    loadSettings();
    const trigger = document.createElement('div'); {
        dom.trigger = trigger;
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
        trigger.addEventListener('contextmenu', async(evt)=>{
            evt.preventDefault();
            showMenu();
        });
        document.body.append(trigger);
    }
    const panel = document.createElement('div'); {
        dom.panel = panel;
        panel.classList.add('stac--panel');
        const head = document.createElement('div'); {
            dom.head = head;
            head.classList.add('stac--head');
            head.addEventListener('click', async()=>{
                const story = chat.filter(mes=>!mes.is_system && isRole(mes, ['assistant']));
                const storyTexts = story.map(it=>getRegexedString(it.mes, regex_placement.AI_OUTPUT, { isPrompt: true }));
                const storyText = storyTexts.join('\n');
                const seg = new Intl.Segmenter('en', { granularity:'sentence' });
                const storySegs = storyTexts.map(it=>[...seg.segment(it)].map(s=>s.segment));
                let sections = [];
                let domSectionPanel;
                const updateSectionPanel = async()=>{
                    sections = getSections();
                    domSectionPanel.innerHTML = '';
                    let idx = 0;
                    for (const storySection of sections) {
                        idx++;
                        const segs = [...seg.segment(storySection)].map(it=>it.segment);
                        const first = document.createElement('div'); {
                            first.classList.add('stac--section');
                            const head = document.createElement('div'); {
                                head.classList.add('stac--details');
                                const title = document.createElement('div'); {
                                    title.classList.add('stac--title');
                                    if (sections.length > 1) {
                                        title.textContent = `<Section-${idx}>`;
                                    }
                                    head.append(title);
                                }
                                const info = document.createElement('div'); {
                                    info.classList.add('stac--info');
                                    info.textContent = `${segs.length} sentences (~${await getTokenCountAsync(storySection)} tokens)`;
                                    head.append(info);
                                }
                                const actions = document.createElement('div'); {
                                    actions.classList.add('stac--actions');
                                    const del = document.createElement('div'); {
                                        del.classList.add('stac--action');
                                        del.classList.add('fa-solid', 'fa-fw');
                                        del.classList.add('fa-trash-can');
                                        del.title = 'Remove section';
                                        del.addEventListener('click', ()=>{
                                            if (settings.sectionList.includes(segs[0].trim())) {
                                                settings.sectionList.splice(settings.sectionList.indexOf(segs[0].trim()), 1);
                                                settings.save();
                                            }
                                            updateSectionPanel();
                                        });
                                        actions.append(del);
                                    }
                                    head.append(actions);
                                }
                                first.append(head);
                            }
                            const start = document.createElement('div'); {
                                start.classList.add('stac--start');
                                const anchor = document.createElement('span'); {
                                    anchor.classList.add('stac--anchor');
                                    anchor.textContent = segs[0];
                                    start.append(anchor);
                                }
                                for (const s of segs.slice(1, 4)) {
                                    const segment = document.createElement('span'); {
                                        segment.classList.add('stac--segment');
                                        segment.textContent = s;
                                        start.append(segment);
                                    }
                                }
                                first.append(start);
                            }
                            const dots = document.createElement('div'); {
                                dots.classList.add('stac--dots');
                                dots.textContent = '[...]';
                                first.append(dots);
                            }
                            const end = document.createElement('div'); {
                                end.classList.add('stac--end');
                                for (const s of segs.slice(-5)) {
                                    const segment = document.createElement('span'); {
                                        segment.classList.add('stac--segment');
                                        segment.textContent = s;
                                        end.append(segment);
                                    }
                                }
                                first.append(end);
                            }
                            domSectionPanel.append(first);
                        }
                    }
                };
                const dom = document.createElement('div'); {
                    dom.classList.add('stac--storyDlg');
                    const storyPanel = document.createElement('div'); {
                        storyPanel.classList.add('stac--col');
                        storyPanel.classList.add('stac--story');
                        storyPanel.classList.add('mes');
                        for (const mes of storySegs) {
                            const m = document.createElement('div'); {
                                m.classList.add('stac--message');
                                m.classList.add('mes_text');
                                let q = false;
                                let prev;
                                for (const s of mes) {
                                    const segment = document.createElement('span'); {
                                        segment.classList.add('stac--segment');
                                        const qParts = s.split('"');
                                        let idx = 0;
                                        for (const qp of qParts) {
                                            let qNew = q;
                                            if (idx > 0) qNew = !q;
                                            if (prev && q && !qNew) prev.textContent += '"';
                                            const el = document.createElement(qNew ? 'q' : 'span'); {
                                                el.textContent = `${qNew && !q ? '"' : ''}${qp}`;
                                                segment.append(el);
                                            }
                                            prev = el;
                                            q = qNew;
                                            idx++;
                                        }
                                        segment.addEventListener('click', ()=>{
                                            if (settings.sectionList.includes(s.trim())) {
                                                settings.sectionList.splice(settings.sectionList.indexOf(s.trim()), 1);
                                            } else {
                                                const idxList = settings.sectionList.map(it=>storyText.indexOf(it));
                                                const idx = storyText.indexOf(s.trim());
                                                const insertIdx = idxList.findIndex(it=>it > idx);
                                                if (idx == -1) settings.sectionList.push(s.trim());
                                                else settings.sectionList.splice(insertIdx, 0, s.trim());
                                            }
                                            settings.save();
                                            updateSectionPanel();
                                        });
                                        m.append(segment);
                                    }
                                }
                                storyPanel.append(m);
                            }
                        }
                        dom.append(storyPanel);
                    }
                    const sectionPanel = document.createElement('div'); {
                        domSectionPanel = sectionPanel;
                        sectionPanel.classList.add('stac--col');
                        sectionPanel.classList.add('stac--sections');
                        updateSectionPanel();
                        dom.append(sectionPanel);
                    }
                    // const previewPanel = document.createElement('div'); {
                    //     previewPanel.classList.add('stac--col');
                    //     dom.append(previewPanel);
                    // }
                }
                const dlg = new Popup(dom, POPUP_TYPE.TEXT);
                await dlg.show();
            });
            panel.append(head);
        }
        const messages = document.createElement('div'); {
            dom.messages = messages;
            messages.classList.add('stac--messages');
            panel.append(messages);
        }
        const form = document.createElement('div'); {
            dom.form = form;
            form.classList.add('stac--form');
            const inp = document.createElement('div'); {
                dom.input = inp;
                inp.contentEditable = 'plaintext-only';
                inp.classList.add('stac--input');
                inp.classList.add('text_pole');
                inp.addEventListener('keydown', async(evt)=>{
                    evt.stopPropagation();
                    if (!evt.shiftKey && !evt.ctrlKey && !evt.altKey && evt.key == 'ArrowRight') {
                        if (document.activeElement == inp && inp.textContent == '') {
                            /**@type {HTMLElement}*/(dom.messages.children[0]?.querySelector('.stac--swipeRight'))?.click();
                        }
                        return;
                    }
                    if (!evt.shiftKey && !evt.ctrlKey && !evt.altKey && evt.key == 'ArrowLeft') {
                        if (document.activeElement == inp && inp.textContent == '') {
                            /**@type {HTMLElement}*/(dom.messages.children[0]?.querySelector('.stac--swipeLeft'))?.click();
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
            const actions = document.createElement('div'); {
                actions.classList.add('stac--actions');
                const historyBtn = document.createElement('div'); {
                    dom.historyBtn = historyBtn;
                    historyBtn.classList.add('stac--action');
                    historyBtn.classList.add('menu_button');
                    historyBtn.classList.add('fa-solid', 'fa-clock-rotate-left');
                    historyBtn.title = 'Input history';
                    historyBtn.addEventListener('click', async(evt)=>{
                        showHistoryMenu();
                    });
                    actions.append(historyBtn);
                }
                const sendBtn = document.createElement('div'); {
                    sendBtn.classList.add('stac--action');
                    sendBtn.classList.add('menu_button');
                    sendBtn.classList.add('fa-solid', 'fa-paper-plane');
                    sendBtn.title = 'Send message';
                    sendBtn.addEventListener('click', async()=>{
                        const text = dom.input.textContent;
                        dom.input.textContent = '';
                        await send(text);
                        dom.input.focus();
                    });
                    actions.append(sendBtn);
                }
                form.append(actions);
            }
            panel.append(form);
        }
        document.body.append(panel);
    }
    panel.style.setProperty('--fontSize', settings.fontSize.toString());
    panel.classList[settings.widthType == WIDTH_TYPE.SCREEN ? 'add' : 'remove']('stac--unlocked');
    panel.style.setProperty('--width', settings.width.toString());
    panel.style.setProperty('--inputColorBg', settings.inputColorBg.toString());
    panel.style.setProperty('--inputColorText', settings.inputColorText.toString());
    panel.style.setProperty('--userColorBg', settings.userColorBg.toString());
    panel.style.setProperty('--userColorText', settings.userColorText.toString());
    panel.style.setProperty('--userColorBgHeader', settings.userColorBgHeader.toString());
    panel.style.setProperty('--userColorTextHeader', settings.userColorTextHeader.toString());
    panel.style.setProperty('--botColorBg', settings.botColorBg.toString());
    panel.style.setProperty('--botColorText', settings.botColorText.toString());
    panel.style.setProperty('--botColorBgHeader', settings.botColorBgHeader.toString());
    panel.style.setProperty('--botColorTextHeader', settings.botColorTextHeader.toString());
    onChatChanged();
    eventSource.on(event_types.CHAT_CHANGED, ()=>(onChatChanged(), null));

    updateHeadLoop();

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'chatchat-setinput',
        callback: (args, value)=>{
            dom.input.textContent = value.toString();
            return '';
        },
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'chatchat-swipe',
        /**
         *
         * @param {import('../../../slash-commands/SlashCommand.js').NamedArguments & {
         *  mes:string,
         * }} args
         * @param {string} value
         */
        callback: (args, value)=>{
            const idx = Number(args.mes ?? (currentChat.messageCount - 1));
            let mes = currentChat.rootMessage;
            for (let i = 0; i < idx; i++) {
                mes = mes.next;
                if (!mes) throw new Error(`/chatchat-swipe no message at index mes=${idx}`);
            }
            if (value?.length) {
                mes.addTextSwipe(value);
            } else {
                mes.goToSwipe(mes.swipeList.length - 1);
                mes.nextSwipe();
            }
            return '';
        },
    }));
};
eventSource.on(event_types.APP_READY, ()=>init());
