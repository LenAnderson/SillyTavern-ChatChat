import { chat, chat_metadata, event_types, eventSource, extension_prompt_roles, extension_prompt_types, Generate, messageFormatting, saveChatConditional, saveMetadata, sendMessageAsUser, setExtensionPrompt, showSwipeButtons, system_message_types, this_chid } from '../../../../script.js';
import { saveMetadataDebounced } from '../../../extensions.js';
import { selected_group } from '../../../group-chats.js';
import { Popup, POPUP_TYPE } from '../../../popup.js';
import { executeSlashCommandsWithOptions } from '../../../slash-commands.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { SlashCommandEnumValue } from '../../../slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { getTokenCountAsync } from '../../../tokenizers.js';
import { delay, isTrueBoolean } from '../../../utils.js';
import { getRegexedString, regex_placement } from '../../regex/engine.js';
import { Chat } from './src/Chat.js';
import { waitForFrame } from './src/lib/wait.js';
import { Message } from './src/Message.js';
import { Section } from './src/Section.js';
import { DELETE_ACTION, Settings, STORY_POSITION, WIDTH_TYPE } from './src/Settings.js';


/**@type {Settings} */
export let settings;

export let isBusy = false;
/**@type {(swipes:{text:string, isFavorite?:boolean}[])=>Promise<string>} */
export let swipeCombiner;


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
    nc.onChange = async()=>{
        await Promise.all([
            nc.save(),
            save(),
        ]);
    };
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
        if (botMes) {
            bm.update(botMes);
        } else {
            bm.performDelete(DELETE_ACTION.DELETE_SWIPE);
        }
        await save();
    };
};
const addChat = ()=>{
    const nc = new Chat();
    hookChat(nc);
    chatList.push(nc.file);
    return nc;
};
/**@type {{subdir:string, id:string, lastChatOn:number}[]} */
const chatList = []; {
    addChat();
}
let chatIndex = 0;
/**@type {Chat} */
export let currentChat;
const dom = {
    /**@type {HTMLElement} */
    trigger: undefined,
    /**@type {HTMLElement} */
    triggerSpinner: undefined,
    /**@type {HTMLElement} */
    panel: undefined,
    /**@type {HTMLElement} */
    panelSpinner: undefined,
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
export const initMetadata = async()=>{
    if (!chat_metadata.chatchat) chat_metadata.chatchat = {};
    if (!chat_metadata.chatchat.settings) chat_metadata.chatchat.settings = {};
    if (chat_metadata.chatchat.settings.isFirstSectionIncluded === undefined) chat_metadata.chatchat.settings.isFirstSectionIncluded = true;
    if (!chat_metadata.chatchat.chatList) {
        chat_metadata.chatchat.chatList = []; {
            const nc = new Chat();
            hookChat(nc);
            chat_metadata.chatchat.chatList.push(nc.file);
            currentChat = nc;
        }
        chat_metadata.chatchat.chatIndex = 0;
    } else if (chat_metadata.chatchat.chatList[0].subdir == undefined || chat_metadata.chatchat.chatList[0].id == undefined) {
        // compat for chat objects in metadata
        const migrateToast = toastr.warning(
            `Migrating ${chat_metadata.chatchat.chatList.length} ChatChats from chat metadata to disk.<br>Please wait...`,
            'ChatChat',
            { closeButton:false, escapeHtml:false, timeOut:0 },
        );
        let idx = 0;
        for (const data of chat_metadata.chatchat.chatList) {
            const chat = Chat.from(data);
            await chat.save();
            chat_metadata.chatchat.chatList[idx] = chat.file;
            idx++;
        }
        await saveMetadata();
        toastr.clear(migrateToast);
        toastr.success(`Migrated ${chat_metadata.chatchat.chatList.length} ChatChats.`, 'ChatChat');
    }
};
const save = async()=>{
    await initMetadata();
    chatList[chatIndex] = currentChat.file;
    chat_metadata.chatchat.chatList = chatList;
    chat_metadata.chatchat.chatIndex = chatIndex;
    saveMetadataDebounced();
};
const onChatChanged = async()=>{
    console.log('[STAC]', 'onChatChanged');
    dom.panel.classList.add('stac--isLoading');
    settings.hide();
    settings.load();
    settings.registerSettings();
    await settings.init();
    await initMetadata();
    while(chatList.pop());
    chatList.push(...chat_metadata.chatchat.chatList);
    if (chatList.length == 0) {
        currentChat = addChat();
        chat_metadata.chatchat.chatIndex = 0;
    }
    chatIndex = chat_metadata.chatchat.chatIndex;
    currentChat = await Chat.load(chatList[chatIndex]);
    hookChat(currentChat);
    reloadChat();
    if ((this_chid === null || this_chid === undefined) && (selected_group === null || selected_group === undefined)) {
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
        if (!isBusy) {
            const allSections = getSections();
            const sections = allSections.filter(it=>it.section?.isIncluded ?? true);
            const storyText = sections.map(it=>it.text).join(' ');
            if (oldText != storyText) {
                updateHead(allSections);
                oldText = storyText;
            }
        }
        await delay(500);
    }
};
const updateHead = async(allSections)=>{
    const seg = new Intl.Segmenter('en', { granularity:'sentence' });
    dom.head.innerHTML = '';
    const emptySections = allSections.filter(it=>!it.text?.length);
    const sections = allSections.filter(it=>it.section?.isIncluded ?? true);
    const storyText = sections.map(it=>it.text).join(' ');
    const first = sections[0].text;
    const last = sections.slice(-1)[0].text;
    const segFirst = [...seg.segment(first)];
    const segLast = [...seg.segment(last)];
    if (emptySections.length) {
        const warn = document.createElement('div'); {
            warn.classList.add('stac--warn');
            warn.classList.add('fa-solid', 'fa-fw', 'fa-triangle-exclamation');
            warn.classList.add('fa-bounce');
            warn.title = `Empty sections: ${emptySections.length}`;
            dom.head.append(warn);
        }
    }
    const start = document.createElement('div'); {
        start.classList.add('stac--start');
        start.textContent = segFirst.slice(0, 4).map(it=>it.segment).join(' ');
        dom.head.append(start);
    }
    const end = document.createElement('div'); {
        end.classList.add('stac--end');
        end.textContent = segLast.slice(-4).map(it=>it.segment.trim()).join(' ');
        end.innerHTML += '&lrm;';
        dom.head.append(end);
    }
    dom.head.title = [
        `Story: ${sections.length} of ${allSections.length || 1} sections (~${await getTokenCountAsync(storyText)} tokens)`,
        '---',
        segFirst.slice(0, 4).map(it=>it.segment.trim()).join(' '),
        '[...]',
        segLast.slice(-4).map(it=>it.segment.trim()).join(' '),
    ].filter(it=>it).join('\n');
};
const reloadChat = async()=>{
    updateHead(getSections());
    currentChat.render(dom.messages);
    dom.panel.classList.remove('stac--isLoading');
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
        await settings.save();
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
    if (botMes) {
        bm.update(botMes);
    } else {
        bm.performDelete(DELETE_ACTION.DELETE_MESSAGE);
    }
    await save();
};

/**
 *
 * @param {*} history
 * @returns {{anchor:string, index:number, text:string, section:Section}[]}
 */
export const getSections = (history)=>{
    history ??= chat;
    const story = history.filter(mes=>!mes.is_system && isRole(mes, ['assistant']));
    const storyText = getRegexedString(story.map(it=>it.mes).join('\n'), regex_placement.AI_OUTPUT, { isPrompt: true });
    const sectionIndex = [{ anchor:'', index:0, text:'', section:null }];
    let prev = sectionIndex[0];
    let empties = [];
    for (const section of settings.sectionList) {
        const { separator:sep } = section;
        const lastIdx = sectionIndex.filter((it,i,list)=>i == 0 || it.index > list[i - 1].index).slice(-1)[0];
        const remaining = storyText.slice(lastIdx.index);
        const idx = remaining.indexOf(sep);
        const absIdx = lastIdx.index + idx;
        if (idx > -1) {
            prev.text = storyText.slice(
                sectionIndex
                    .filter((it,i,list)=>i == 0 || it.index > list[i - 1].index)
                    .slice(-1)[0].index,
                absIdx,
            );
            while (empties.length) {
                const e = empties.pop();
                e.index = absIdx;
            }
            const item = {
                anchor: sep,
                index: absIdx,
                text: '',
                section,
            };
            sectionIndex.push(item);
            prev = item;
        } else {
            const item = { anchor:sep, index:-1, text:'', section };
            sectionIndex.push(item);
            empties.push(item);
        }
    }
    prev.text = storyText.slice(
        sectionIndex
            .filter((it,i,list)=>i == 0 || it.index > list[i - 1].index)
            .slice(-1)[0].index,
    );
    while (empties.length) {
        const e = empties.pop();
        e.index = prev.index;
    }
    // if (prevEmpty) {
    //     sections.push({ anchor:'', text:storyText.slice(sectionIndex.slice(-1)[0]) });
    //     while (empties.length) {
    //         const sep = empties.pop();
    //         sections.push({ anchor:sep, text:'' });
    //     }
    // } else {
    //     while (empties.length) {
    //         const sep = empties.pop();
    //         sections.push({ anchor:sep, text:'' });
    //     }
    //     sections.push({ anchor:prevSep, text:storyText.slice(sectionIndex.slice(-1)[0]) });
    // }
    return sectionIndex;
};
export const getParagraph = (section, paragraphStart, paragraphEnd = null)=>{
    return (getSections()[section - 1]?.text
        .split(/\n+/)
        .slice(paragraphStart - 1, (paragraphEnd ?? paragraphStart + 1) - 1) ?? []
    ).join('\n');
};

/**
 *
 * @param {Message[]} history
 * @param {string} userText
 * @param {Message} bm
 * @returns {Promise<{ userMes:import('./src/Message.js').ChatMessage, botMes:import('./src/Message.js').ChatMessage }>}
 */
const gen = async(history, userText, bm)=>{
    isBusy = true;

    // remember current chat input
    const ta = /**@type {HTMLTextAreaElement}*/(document.querySelector('#send_textarea'));
    const taInput = ta.value;
    ta.value = '';

    // execute pre-scripts
    if (settings.scriptBefore.length > 1 && settings.scriptBefore[0] == '/') {
        await executeSlashCommandsWithOptions(settings.scriptBefore, {
            handleExecutionErrors: true,
            handleParserErrors: true,
            source: 'chatchat-before',
        });
    }

    // make sure chat is saved
    await saveChatConditional();

    // add style to hide mesages that ChatChat adds to main chat
    const style = document.createElement('style');
    style.innerHTML = `
        #chat .mes {
            &[mesid="${chat.length}"], &[mesid="${chat.length + 1}"] {
                display: none;
            }
        }
    `;
    document.body.append(style);

    // clone current chat array for restoring later
    const chatClone = structuredClone(chat.map(it=>Object.assign({}, it)));

    // build story block
    const allSections = getSections(chat);
    const sections = allSections.map((section,idx)=>({ section, idx:idx + 1 })).filter(it=>it.section.section?.isIncluded ?? settings.isFirstSectionIncluded);
    let story = '';
    if (sections.length == 1) {
        story = getRegexedString(sections[0].section.text, regex_placement.AI_OUTPUT, { isPrompt: true });
    } else if (sections.length > 1) {
        story = sections.map(({ section:it, idx })=>`<Section-${idx}>\n${getRegexedString(it.text, regex_placement.AI_OUTPUT, { isPrompt: true })}\n</Section-${idx}>`).join('\n');
    }
    for (const mes of chat) {
        //TODO use getTokenCountAsync('...') to limit tokens
        if (mes.is_system) continue;
        mes.is_system = true;
    }

    // add story block as injection
    if (story.length) {
        setExtensionPrompt(
            'chatchat-content',
            `<Story>${story}</Story>`,
            extension_prompt_types.IN_CHAT,
            settings.storyPosition == STORY_POSITION.BEFORE_CHAT ? history.length + 2 : settings.storyDepth,
            true,
            extension_prompt_roles.SYSTEM,
        );
    }

    // add user injections (settings are not implemented)
    settings.injectList.forEach(({ text, type, depth, scan, role },idx)=>setExtensionPrompt(
        `chatchat-user-${idx}`,
        text,
        type,
        depth,
        scan,
        role,
    ));

    // add ChatChat messages (history) as injections
    const historyInjects = [];
    for (const h of history) {
        const id = `chatchat-history-${historyInjects.length}`;
        const text = h.text.replace(/{{para::(\d+)::(\d+)}}/g, (_, section, paragraph)=>{
            const s = allSections[parseInt(section) - 1];
            return s?.text.split(/\n+/).at(parseInt(paragraph) - 1) ?? '';
        });
        const args = [
            id,
            getRegexedString(text, regex_placement.AI_OUTPUT, { isPrompt: true }),
            extension_prompt_types.IN_CHAT,
            history.length - historyInjects.length + 1,
            true,
            h.isUser ? extension_prompt_roles.USER : extension_prompt_roles.ASSISTANT,
        ];
        historyInjects.push(args);
        setExtensionPrompt(args[0], args[1], args[2], args[3], args[4], args[5]);
    }

    // send the latest user message as regular chat message
    const userTextFinal = userText.replace(/{{para::(\d+)::(\d+)}}/g, (_, section, paragraph)=>{
        const s = allSections[parseInt(section) - 1];
        return s?.text.split(/\n+/).at(parseInt(paragraph) - 1) ?? '';
    });
    await sendMessageAsUser(userTextFinal, null);
    const userMes = structuredClone(chat.slice(-1)[0]);

    // wait for and then observe bot message to stream the response
    let botMes;
    const idx = chat.length;
    let isDone = false;
    let original;
    let proxy;
    try {
        const prom = Generate('normal').then(()=>isDone = true).catch(()=>isDone = true);
        let mes;
        while (!isDone && !mes) {
            mes = document.querySelector(`#chat .mes[mesid="${idx}"] .mes_text`);
            if (mes) {
                original = chat[idx];
                proxy = new Proxy(original, {
                    set: (target, p, newValue, receiver)=>{
                        if (p == 'mes') {
                            bm.updateText(newValue);
                        }
                        return Reflect.set(target, p, newValue, receiver);
                    },
                });
                chat[idx] = proxy;
            }
            await delay(100);
        }
        await prom;
    } catch (ex) {
        console.error('[STAC]', ex);
        toastr.error(ex.message, 'ChatChat');
    }

    if (original) {
        // save the bot message
        botMes = structuredClone(Object.assign({}, original));
        dom.messages.children[0].querySelector('.stac--date').textContent = botMes.send_date;
    } else {
        botMes = null;
    }

    // restore original chat array
    chat.splice(0, chatClone.length, ...chatClone);

    if (chat.length > chatClone.length) {
        // remove the messages ChatChat had added to regular chat
        await executeSlashCommandsWithOptions(`/cut ${chatClone.length}-{{lastMessageId}}`);
    }
    // remove the style to hide those messages
    style.remove();

    // remove user injections
    settings.injectList.forEach(({ text, position, depth, scan, role },idx)=>setExtensionPrompt(
        `chatchat-user-${idx}`,
        '',
        position,
        depth,
        scan,
        role,
    ));

    // remove story block injection
    setExtensionPrompt(
        'chatchat-content',
        '',
        extension_prompt_types.IN_CHAT,
        1,
        true,
        extension_prompt_roles.SYSTEM,
    );

    // remove ChatChat messages (history) injections
    for (const h of historyInjects) {
        setExtensionPrompt(h[0], '', h[2], h[3], h[4], h[5]);
    }

    // execute after-scripts
    if (settings.scriptAfter.length > 1 && settings.scriptAfter[0] == '/') {
        await executeSlashCommandsWithOptions(settings.scriptAfter, {
            handleExecutionErrors: true,
            handleParserErrors: true,
            source: 'chatchat-after',
        });
    }

    // restore chat input
    ta.value = taInput;

    isBusy = false;

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
                dom.panel.classList.add('stac--isLoading');
                hideMenu();
                const nc = addChat();
                chatIndex = chatList.length - 1;
                currentChat = nc;
                await save();
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
                if (currentChat.equals(c)) item.classList.add('stac--current');
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
                            del.addEventListener('click', async(evt)=>{
                                evt.stopPropagation();
                                let isCurrent = currentChat?.equals(c);
                                chatList.splice(chatList.findIndex(it=>it.subdir == c.subdir && it.id == c.id), 1);
                                if (isCurrent) {
                                    dom.panel.classList.add('stac--isLoading');
                                    if (chatList.length > chatIndex) {
                                        // keep index, show next chat
                                        currentChat = await Chat.load(chatList[chatIndex]);
                                        hookChat(currentChat);
                                        item.previousElementSibling.classList.add('stac--current');
                                    } else if (chatList.length > 0) {
                                        // show prev chat
                                        chatIndex--;
                                        currentChat = await Chat.load(chatList[chatIndex]);
                                        hookChat(currentChat);
                                        item.nextElementSibling.classList.add('stac--current');
                                    } else {
                                        // add new empty chat
                                        const nc = addChat();
                                        currentChat = nc;
                                        renderItem(nc);
                                    }
                                } else {
                                    chatIndex = chatList.findIndex(it=>it.subdir == c.subdir && it.id == c.id);
                                }
                                item.style.height = `${item.getBoundingClientRect().height}px`;
                                waitForFrame().then(async()=>{
                                    item.classList.add('stac--remove');
                                    item.style.height = '0';
                                    await delay(410);
                                    item.remove();
                                });
                                await save();
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
                                const listener = async(evt)=>{
                                    evt.stopPropagation();
                                    if (evt.shiftKey || evt.altKey || evt.ctrlKey || evt.key != 'Enter') return;
                                    titleEl.removeEventListener('keydown', listener);
                                    titleEl.removeAttribute('contenteditable');
                                    let chat;
                                    if (c.id == currentChat.id) {
                                        chat = currentChat;
                                    } else {
                                        chat = await Chat.load(c);
                                    }
                                    chat.title = titleEl.textContent;
                                    Object.assign(c, chat.file);
                                    await chat.save();
                                    await save();
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
                    dom.panel.classList.add('stac--isLoading');
                    hideMenu();
                    chatIndex = chatList.findIndex(it=>it.subdir == c.subdir && it.id == c.id);
                    currentChat = await Chat.load(c);
                    hookChat(currentChat);
                    await save();
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
    let isReady = false;
    loadSettings();

    // UI
    const trigger = document.createElement('div'); {
        dom.trigger = trigger;
        trigger.classList.add('stac--trigger');
        trigger.classList.add('fa', 'fa-solid', 'fa-comment-alt');
        trigger.title = 'Click to toggle ChatChat\nRight-click for settings and chat management';
        trigger.addEventListener('click', ()=>{
            if (!isReady) return;
            if (isBusy) return;
            if (panel.classList.toggle('stac--active')) {
                dom.input.focus();
            } else {
                dom.input.blur();
            }
        });
        trigger.addEventListener('contextmenu', async(evt)=>{
            evt.preventDefault();
            if (!isReady) return;
            if (isBusy) return;
            showMenu();
        });
        const spinner = document.createElement('div'); {
            dom.triggerSpinner = spinner;
            spinner.classList.add('stac--spinner');
            spinner.classList.add('fa', 'fa-solid', 'fa-spin-pulse', 'fa-spinner');
            trigger.append(spinner);
        }
        document.body.append(trigger);
    }
    const panel = document.createElement('div'); {
        dom.panel = panel;
        panel.classList.add('stac--panel');
        const messages = document.createElement('div'); {
            dom.messages = messages;
            messages.classList.add('stac--messages');
            messages.addEventListener('click', async(evt)=>{
                const target = /**@type {HTMLElement}*/(evt.target);
                if (target.classList.contains('stac--copy') && target.closest('.stac--blockquote')) {
                    const text = target.getAttribute('data-text');
                    let ok = false;
                    try {
                        navigator.clipboard.writeText(text);
                        ok = true;
                    } catch {
                        console.warn('/copy cannot use clipboard API, falling back to execCommand');
                        const ta = document.createElement('textarea'); {
                            ta.value = text;
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
                    target.classList.add(`stac--${ok ? 'success' : 'failure'}`);
                    await delay(1000);
                    target.classList.remove(`stac--${ok ? 'success' : 'failure'}`);
                } else if (target.classList.contains('stac--first')) {
                    dom.messages.children[dom.messages.children.length - 1]?.scrollIntoView({ behavior:'smooth', block:'start' });
                } else if (target.classList.contains('stac--prev')) {
                    dom.messages.children[[...dom.messages.children].indexOf(target.closest('.stac--message')) + 1]?.scrollIntoView({ behavior:'smooth', block:'start' });
                } else if (target.classList.contains('stac--next')) {
                    dom.messages.children[[...dom.messages.children].indexOf(target.closest('.stac--message')) - 1]?.scrollIntoView({ behavior:'smooth', block:'start' });
                } else if (target.classList.contains('stac--last')) {
                    dom.messages.children[0]?.scrollIntoView({ behavior:'smooth', block:'start' });
                }
            });
            panel.append(messages);
        }
        const form = document.createElement('div'); {
            dom.form = form;
            form.classList.add('stac--form');
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
                        for (const { anchor, text:storySection, section:sec } of sections) {
                            idx++;
                            const segs = [...seg.segment(storySection)].map(it=>it.segment);
                            const first = document.createElement('div'); {
                                first.classList.add('stac--section');
                                if (!(sec?.isIncluded ?? true)) first.classList.add('stac--hidden');
                                const head = document.createElement('div'); {
                                    head.classList.add('stac--details');
                                    const title = document.createElement('div'); {
                                        title.classList.add('stac--title');
                                        if (sections.length > 1) {
                                            title.textContent = `<Section-${idx}>`;
                                            title.title = `anchor: ${anchor}`;
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
                                        if (sec || true) {
                                            const hide = document.createElement('div'); {
                                                hide.classList.add('stac--action');
                                                hide.classList.add('stac--hide');
                                                hide.classList.add('fa-solid', 'fa-fw');
                                                if (sec?.isIncluded ?? settings.isFirstSectionIncluded) hide.classList.add('fa-eye');
                                                else hide.classList.add('fa-eye-slash');
                                                hide.title = 'Remove section';
                                                hide.addEventListener('click', async ()=>{
                                                    if (sec) {
                                                        sec.isIncluded = !sec.isIncluded;
                                                    } else {
                                                        settings.isFirstSectionIncluded = !settings.isFirstSectionIncluded;
                                                    }
                                                    if (sec?.isIncluded ?? settings.isFirstSectionIncluded) {
                                                        hide.classList.add('fa-eye');
                                                        hide.classList.remove('fa-eye-slash');
                                                        first.classList.remove('stac--hidden');
                                                    } else {
                                                        hide.classList.remove('fa-eye');
                                                        hide.classList.add('fa-eye-slash');
                                                        first.classList.add('stac--hidden');
                                                    }
                                                    await settings.save();
                                                });
                                                actions.append(hide);
                                            }
                                            const del = document.createElement('div'); {
                                                del.classList.add('stac--action');
                                                del.classList.add('fa-solid', 'fa-fw');
                                                del.classList.add('fa-trash-can');
                                                del.title = 'Remove section';
                                                del.addEventListener('click', async ()=>{
                                                    if (settings.sectionList.map(it=>it.separator == anchor)) {
                                                        settings.sectionList.splice(settings.sectionList.findIndex(it=>it.separator == anchor), 1);
                                                        await settings.save();
                                                    }
                                                    updateSectionPanel();
                                                });
                                                actions.append(del);
                                            }
                                        }
                                        head.append(actions);
                                    }
                                }
                                first.append(head);
                                const content = document.createElement('div'); {
                                    content.classList.add('stac--content');
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
                                        content.append(start);
                                    }
                                    const dots = document.createElement('div'); {
                                        dots.classList.add('stac--dots');
                                        dots.textContent = '[...]';
                                        content.append(dots);
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
                                        content.append(end);
                                    }
                                    first.append(content);
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
                                            segment.addEventListener('click', async()=>{
                                                if (settings.sectionList.find(it=>it.separator == s.trim())) {
                                                    settings.sectionList.splice(settings.sectionList.findIndex(it=>it.separator == s.trim()), 1);
                                                } else {
                                                    const idxList = settings.sectionList.map(it=>storyText.indexOf(it.separator));
                                                    const idx = storyText.indexOf(s.trim());
                                                    const insertIdx = idxList.findIndex(it=>it > idx);
                                                    if (insertIdx == -1) settings.sectionList.push(Section.create(s.trim()));
                                                    else settings.sectionList.splice(insertIdx, 0, Section.create(s.trim()));
                                                }
                                                await settings.save();
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
                form.append(head);
            }
            const main = document.createElement('div'); {
                main.classList.add('stac--main');
                const inp = document.createElement('div'); {
                    dom.input = inp;
                    inp.contentEditable = 'plaintext-only';
                    inp.classList.add('stac--input');
                    inp.classList.add('text_pole');
                    inp.addEventListener('keydown', async(evt)=>{
                        if (isBusy) return;
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
                    main.append(inp);
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
                            if (isBusy) return;
                            const text = dom.input.textContent;
                            dom.input.textContent = '';
                            await send(text);
                            dom.input.focus();
                        });
                        actions.append(sendBtn);
                    }
                    main.append(actions);
                }
                form.append(main);
            }
            panel.append(form);
        }
        const spinner = document.createElement('div'); {
            dom.panelSpinner = spinner;
            spinner.classList.add('stac--spinner');
            const icon = document.createElement('div'); {
                icon.classList.add('fa', 'fa-solid', 'fa-spin-pulse', 'fa-spinner');
                spinner.append(icon);
            }
            panel.append(spinner);
        }
        document.body.append(panel);
    }
    { // css stuff
        panel.classList[settings.widthType == WIDTH_TYPE.SCREEN ? 'add' : 'remove']('stac--unlocked');
        panel.style.setProperty('--fontSize', settings.fontSize.toString());
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
    }
    await onChatChanged();
    eventSource.on(event_types.CHAT_CHANGED, ()=>(onChatChanged(), null));

    // check for swipe combiner
    try {
        swipeCombiner = (await import('../SillyTavern-SwipeCombiner/index.js')).showSwipeCombiner;
    } catch {
        console.log('[STAC]', 'swipe combiner not found');
    }

    updateHeadLoop();

    // slash commands
    function isTrueFlag(value) {
        return isTrueBoolean((value ?? 'false') || 'true');
    }
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'chatchat-setinput',
        callback: (args, value)=>{
            setInput(value.toString());
            return '';
        },
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: 'text',
            }),
        ],
        helpString: 'Sets the chat input field for ChatChat.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'chatchat-swipe',
        /**
         *
         * @param {import('../../../slash-commands/SlashCommand.js').NamedArguments & {
         *  mes:string,
         * }} args
         * @param {string} value
         */
        callback: async(args, value)=>{
            let idx = Number(args.mes);
            if (args.mes == undefined) idx = currentChat.messageCount - 1;
            else if (idx < 0) idx = currentChat.messageCount + idx;
            let mes = currentChat.rootMessage;
            for (let i = 0; i < idx; i++) {
                mes = mes.next;
                if (!mes) throw new Error(`/chatchat-swipe no message at index mes=${idx}`);
            }
            if (value?.length) {
                mes.addTextSwipe(value);
            } else {
                await mes.goToSwipe(mes.swipeList.length - 1);
                await mes.nextSwipe();
            }
            return '';
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'mes',
                description: 'index of the message to swipe',
                typeList: [ARGUMENT_TYPE.NUMBER],
                defaultValue: 'last message',
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: 'swipe text - leave blank to keep current text (user) or generate (bot)',
            }),
        ],
        helpString: 'Adds a new swipe to a message.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'chatchat-message',
        callback: (args, value)=>{
            let idx = Number(value);
            if (value == undefined) idx = currentChat.messageCount - 1;
            else if (idx < 0) idx = currentChat.messageCount + idx;
            let mes = currentChat.rootMessage;
            for (let i = 0; i < idx; i++) {
                mes = mes.next;
                if (!mes) throw new Error(`/chatchat-message no message at index mes=${idx}`);
            }
            let text = mes.text;
            if (isTrueFlag(args.sub)) {
                let sections;
                text = text.replace(/{{para::(\d+)::(\d+)}}/g, (_, section, paragraph)=>{
                    if (!sections) sections = getSections();
                    const s = sections[parseInt(section) - 1];
                    return s?.text.split(/\n+/).at(parseInt(paragraph) - 1) ?? '';
                });
            }
            return text;
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'sub',
                description: 'substitute macros (e.g., {{para::...}})',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: 'message index (negative starts at last message)',
                typeList: [ARGUMENT_TYPE.NUMBER],
                defaultValue: 'last message',
            }),
        ],
        returns: 'Message text.',
        helpString: 'Retrieves text from a message.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'chatchat-edit',
        callback: (args, value)=>{
            let idx = Number(value[0]);
            if (value[0] == undefined) idx = currentChat.messageCount - 1;
            else if (idx < 0) idx = currentChat.messageCount + idx;
            let mes = currentChat.rootMessage;
            for (let i = 0; i < idx; i++) {
                mes = mes.next;
                if (!mes) throw new Error(`/chatchat-message no message at index mes=${idx}`);
            }
            mes.updateText(value[1].toString());
            return '';
        },
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: 'message index (negative starts at the back)',
                typeList: [ARGUMENT_TYPE.NUMBER],
                isRequired: true,
            }),
            SlashCommandArgument.fromProps({ description: 'new message text',
                isRequired: true,
            }),
        ],
        splitUnnamedArgument: true,
        splitUnnamedArgumentCount: 1,
        helpString: 'Edit the text of a ChatChat message.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'chatchat-replacepara',
        /**
         *
         * @param {import('../../../slash-commands/SlashCommand.js').NamedArguments & {
         * }} args
         * @param {[section:string, paragraph:string, newText:string]} value
         */
        callback: async(args, value)=>{
            const s = parseInt(value[0]);
            const p = value[1].split('-').map(it=>parseInt(it));
            const t = value[2];
            const old = getParagraph(s, ...p);
            if (old?.length) {
                const mesId = chat.findIndex(it=>!it.is_system && isRole(it, ['assistant']) && it.mes.includes(old));
                if (mesId > -1) {
                    /**@type {import('./src/Message.js').ChatMessage} */
                    const mes = chat[mesId];
                    if (!mes.swipes) {
                        mes.swipes = [mes.mes];
                    }
                    if (!mes.swipe_info) {
                        mes.swipe_info = [{
                            extra: structuredClone(mes.extra),
                            gen_finished: mes.gen_finished,
                            gen_started: mes.gen_started,
                            send_date: mes.send_date,
                        }];
                    }
                    if (mes.swipe_id === undefined) {
                        mes.swipe_id = 0;
                    }
                    const mesText = mes.mes.replace(old, `§§§STAC§§§${t}§§§/STAC§§§`);
                    mes.mes = mes.mes.replace(old, t);
                    mes.swipes.push(mes.mes);
                    mes.swipe_info.push(structuredClone(mes.swipe_info[mes.swipe_id]));
                    mes.swipe_id++;
                    const el = document.querySelector(`#chat .mes[mesid="${mesId}"] .mes_text`);
                    if (el) {
                        el.innerHTML = messageFormatting(mesText, mes.name, mes.is_system, mes.is_user, mesId)
                            .replace(/§§§STAC§§§(.+)§§§\/STAC§§§/s, '<span class="stac--flash">$1</span>')
                        ;
                        const pel = el.querySelector('.stac--flash');
                        pel.scrollIntoView({ behavior:'instant', block:'center', inline:'center' });
                        delay(3000).then(()=>pel.replaceWith(...pel.childNodes));
                        eventSource.emit(event_types.MESSAGE_SWIPED, mesId);
                        saveChatConditional();
                    }
                    showSwipeButtons();
                }
            }
            return '';
        },
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({ description: 'section (1-based)',
                typeList: [ARGUMENT_TYPE.NUMBER],
                enumProvider: ()=>[...('.'.repeat(settings.sectionList.length))].map((_,idx)=>new SlashCommandEnumValue((idx + 1).toString(), settings.sectionList[idx].separator)),
                isRequired: true,
            }),
            SlashCommandArgument.fromProps({ description: 'paragraph (1-based)',
                typeList: [ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.RANGE],
                isRequired: true,
            }),
            SlashCommandArgument.fromProps({ description: 'new text',
                isRequired: true,
            }),
        ],
        splitUnnamedArgument: true,
        splitUnnamedArgumentCount: 2,
        helpString: `
            <div>
                Replace a pragraph in a story section. Creates a new swipe in the chat message that
                is the source of that paragraph.
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'chatchat-trigger',
        callback: async(args, value)=>{
            await send('');
            return '';
        },
        helpString: 'trigger ChatChat reply',
    }));

    // unblock
    dom.triggerSpinner.remove();
    isReady = true;
};
eventSource.on(event_types.APP_READY, ()=>init());

/**
 * @param {string} text
 */
export const setInput = (text)=>{
    dom.input.textContent = text;
};


//!DEBUG log events to console
for (const e of Object.values(event_types)) {
    eventSource.on(e, ()=>console.warn('[_EVENT_]', e, chat.length));
}
//!DEBUG log chat length changes
(async()=>{
    let len = chat.length;
    while (true) {
        if (len != chat.length) {
            console.warn('[_LEN_]', chat.length);
            len = chat.length;
        }
        await delay(100);
    }
})();
//!DEBUG .hideChatAvatars mutations
{
    // observe document.body for class changes
    let hca = document.body.classList.contains('hideChatAvatars');
    const mo = new MutationObserver(()=>{
        const nhca = document.body.classList.contains('hideChatAvatars');
        if (nhca != hca) {
            alert('HIDE CHAT AVATARS');
            debugger;
            hca = nhca;
        }
    });
    mo.observe(document.body, { attributes:true });
    // proxy jQuery addClass function
    const original_addClass = jQuery.prototype.addClass;
    jQuery.prototype.addClass = function(...args) {
        if (args[0].includes('hideChatAvatars')) {
            console.error('[ADDCLASS]', ...args);
            debugger;
        }
        return original_addClass.bind(this)(...args);
    };
    // proxy native classList.add and classList.toggle functions
    const original_add = DOMTokenList.prototype.add;
    const original_toggle = DOMTokenList.prototype.toggle;
    DOMTokenList.prototype.add = function(...args) {
        if (args.includes('hideChatAvatars')) {
            console.error('[CLASSLIST.ADD]', ...args);
            debugger;
        }
        return original_add.bind(this)(...args);
    };
    DOMTokenList.prototype.toggle = function(...args) {
        if (args.includes('hideChatAvatars')) {
            console.error('[CLASSLIST.TOGGLE]', ...args);
            debugger;
        }
        return original_toggle.bind(this)(...args);
    };
}
}
