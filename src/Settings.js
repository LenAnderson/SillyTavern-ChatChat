import { characters, chat_metadata, MAX_INJECTION_DEPTH, saveSettingsDebounced } from '../../../../../script.js';
import { extension_settings, saveMetadataDebounced } from '../../../../extensions.js';
import { delay } from '../../../../utils.js';
import { initMetadata } from '../index.js';
import { Message } from './Message.js';
// eslint-disable-next-line no-unused-vars
import { BaseSetting } from './settings/BaseSetting.js';
import { CheckboxSetting } from './settings/CheckboxSetting.js';
import { ColorSetting } from './settings/ColorSetting.js';
import { CustomSetting } from './settings/CustomSetting.js';
import { MultilineTextSetting } from './settings/MultiLineTextSetting.js';
import { NumberSetting } from './settings/NumberSetting.js';
import { SelectSetting } from './settings/SelectSetting.js';

/** @readonly */
/** @enum {string?} */
export const WIDTH_TYPE = {
    ASIDE: 'aside',
    SCREEN: 'screen',
};
/** @readonly */
/** @enum {string?} */
export const STORY_POSITION = {
    BEFORE_CHAT: 'before chat',
    IN_CHAT: 'in chat',
};
/** @readonly */
/** @enum {string?} */
export const DELETE_ACTION = {
    SHOW_MENU: 'Show menu',
    DELETE_MESSAGE: 'Delete message and swipes',
    DELETE_BRANCH: 'Delete branch (message, swipes, and following messages)',
    DELETE_SWIPE: 'Delete swipe and following messages',
};

export class Settings {
    // global settings
    /**@type {number} */ fontSize = 1.0;
    /**@type {WIDTH_TYPE} */ widthType = WIDTH_TYPE.ASIDE;
    /**@type {number} */ width = 0.5;
    /**@type {number} */ maxInputHistory = 100;
    /**@type {DELETE_ACTION} */ deleteAction = DELETE_ACTION.SHOW_MENU;
    /**@type {string} */ userColorBg = 'rgba(120, 120, 120, 0.75)';
    /**@type {string} */ userColorText = 'rgba(255, 255, 255, 1)';
    /**@type {string} */ userColorBgHeader = 'rgba(120, 120, 120, 0.5)';
    /**@type {string} */ userColorTextHeader = 'rgba(255, 255, 255, 1)';
    /**@type {string} */ botColorBg = 'rgba(0, 0, 255, 0.75)';
    /**@type {string} */ botColorText = 'rgba(255, 255, 255, 1)';
    /**@type {string} */ botColorBgHeader = 'rgba(120, 120, 120, 0.5)';
    /**@type {string} */ botColorTextHeader = 'rgba(255, 255, 255, 1)';
    /**@type {string} */ inputColorBg = 'rgba(0, 0, 0, 0.3)';
    /**@type {string} */ inputColorText = 'rgba(255, 255, 255, 1)';

    // chat settings
    /**@type {string} */ scriptBefore = '';
    /**@type {string} */ scriptAfter = '';
    /**@type {object[]} */ injectList = [];
    /**@type {STORY_POSITION} */ storyPosition = STORY_POSITION.BEFORE_CHAT;
    /**@type {number} */ storyDepth = 1;
    /**@type {string} */ character;
    /**@type {string[]} */ inputHistory = [];
    /**@type {string[]} */ sectionList = [];

    /**@type {BaseSetting[]}*/ settingList = [];



    /**@type {()=>void} */ onRestart;


    /**@type {HTMLElement}*/ dom;
    /**@type {HTMLElement}*/ parent;

    constructor() {
        this.load();
        this.registerSettings();
        this.init();
    }

    toJSON() {
        return {
            fontSize: this.fontSize,
            widthType: this.widthType,
            width: this.width,
            userColorBg: this.userColorBg,
            userColorText: this.userColorText,
            userColorBgHeader: this.userColorBgHeader,
            userColorTextHeader: this.userColorTextHeader,
            botColorBg: this.botColorBg,
            botColorText: this.botColorText,
            botColorBgHeader: this.botColorBgHeader,
            botColorTextHeader: this.botColorTextHeader,
            inputColorBg: this.inputColorBg,
            inputColorText: this.inputColorText,

            scriptBefore: this.scriptBefore,
            scriptAfter: this.scriptAfter,
            injectList: this.injectList,
            storyPosition: this.storyPosition,
            storyDepth: this.storyDepth,
            character: this.character,
            inputHistory: this.inputHistory,
        };
    }

    load() {
        Object.assign(this, extension_settings.chatchat ?? {});
        const chatSettings = chat_metadata?.chatchat?.settings ?? {};
        if (!chatSettings.inputHistory) chatSettings.inputHistory = [];
        Object.assign(this, chatSettings);
    }


    registerSettings() {
        while (this.settingList.pop());
        { // global
            { //general
                this.settingList.push(NumberSetting.fromProps({ id: 'stac--fontSize',
                    name: 'Font Scale',
                    description: 'Font scale for the chat UI, relative to regular ST font size.',
                    category: ['Global', 'General'],
                    initialValue: this.fontSize,
                    min: 0.1,
                    max: 2.0,
                    step: 0.01,
                    onChange: (it)=>{
                        this.fontSize = it.value;
                        /**@type {HTMLElement}*/(document.querySelector('.stac--panel')).style.setProperty('--fontSize', this.fontSize.toString());
                        this.save();
                    },
                }));
                this.settingList.push(CheckboxSetting.fromProps({ id: 'stac--widthType',
                    name: 'Unlock Chat Width',
                    description: 'Check to allow the chat to take up more space then what\'s available next to the main chat.',
                    category: ['Global', 'General'],
                    initialValue: this.widthType == WIDTH_TYPE.SCREEN,
                    onChange: (it)=>{
                        this.widthType = it.value ? WIDTH_TYPE.SCREEN : WIDTH_TYPE.ASIDE;
                        /**@type {HTMLElement}*/(document.querySelector('.stac--panel')).classList[it.value ? 'add' : 'remove']('stac--unlocked');
                        this.save();
                    },
                }));
                this.settingList.push(NumberSetting.fromProps({ id: 'stac--width',
                    name: 'Chat Width',
                    description: 'Width of the chat, only takes effect if width is unlocked.',
                    category: ['Global', 'General'],
                    initialValue: this.width,
                    min: 0.25,
                    max: 1.0,
                    step: 0.01,
                    onChange: (it)=>{
                        this.width = it.value;
                        /**@type {HTMLElement}*/(document.querySelector('.stac--panel')).style.setProperty('--width', this.width.toString());
                        this.save();
                    },
                }));
                this.settingList.push(NumberSetting.fromProps({ id: 'stac--maxInputHistory',
                    name: 'Input History Length',
                    description: 'Number of items to keep in the chat input history.',
                    category: ['Global', 'General'],
                    initialValue: this.maxInputHistory,
                    min: 1,
                    max: 9999,
                    step: 1,
                    onChange: (it)=>{
                        this.maxInputHistory = it.value;
                        this.save();
                    },
                }));
                this.settingList.push(SelectSetting.fromProps({ id: 'stac--deleteAction',
                    name: 'Default Delete Action',
                    description: 'Action to perform when clicking on a message\'s delete button.<br>You can always right-click to open or close the delete menu.',
                    category: ['Global', 'General'],
                    initialValue: this.deleteAction,
                    optionList: Object.entries(DELETE_ACTION).map(it=>({ value:it[1], label:it[1] })),
                    onChange: (it)=>{
                        this.deleteAction = it.value;
                        for (const el of /**@type {NodeListOf<HTMLElement>}*/(document.querySelectorAll('.stac--panel .stac--message .stac--actions .stac--action.stac--delete'))) {
                            el.title = it.value;
                        }
                        this.save();
                    },
                }));
            }
            { // colors
                this.settingList.push(ColorSetting.fromProps({ id: 'stac--userColorBg',
                    name: 'User Message Background Color',
                    description: 'Background color for the user message bubbles.',
                    category: ['Global', 'Colors', 'User'],
                    initialValue: this.userColorBg,
                    onChange: (it)=>{
                        this.userColorBg = it.value;
                        /**@type {HTMLElement}*/(document.querySelector('.stac--panel')).style.setProperty('--userColorBg', this.userColorBg.toString());
                        this.save();
                    },
                }));
                this.settingList.push(ColorSetting.fromProps({ id: 'stac--userColorText',
                    name: 'User Message Text Color',
                    description: 'Text color for the user message bubbles.',
                    category: ['Global', 'Colors', 'User'],
                    initialValue: this.userColorText,
                    onChange: (it)=>{
                        this.userColorText = it.value;
                        /**@type {HTMLElement}*/(document.querySelector('.stac--panel')).style.setProperty('--userColorText', this.userColorText.toString());
                        this.save();
                    },
                }));
                this.settingList.push(ColorSetting.fromProps({ id: 'stac--userColorBgHeader',
                    name: 'User Message Header Background Color',
                    description: 'Background color for the headers on user message bubbles.',
                    category: ['Global', 'Colors', 'User'],
                    initialValue: this.userColorBgHeader,
                    onChange: (it)=>{
                        this.userColorBgHeader = it.value;
                        /**@type {HTMLElement}*/(document.querySelector('.stac--panel')).style.setProperty('--userColorBgHeader', this.userColorBgHeader.toString());
                        this.save();
                    },
                }));
                this.settingList.push(ColorSetting.fromProps({ id: 'stac--userColorTextHeader',
                    name: 'User Message Header Text Color',
                    description: 'Text color for the headers on user message bubbles.',
                    category: ['Global', 'Colors', 'User'],
                    initialValue: this.userColorTextHeader,
                    onChange: (it)=>{
                        this.userColorTextHeader = it.value;
                        /**@type {HTMLElement}*/(document.querySelector('.stac--panel')).style.setProperty('--userColorTextHeader', this.userColorTextHeader.toString());
                        this.save();
                    },
                }));
                this.settingList.push(ColorSetting.fromProps({ id: 'stac--botColorBg',
                    name: 'Bot Message Background Color',
                    description: 'Background color for the bot message bubbles.',
                    category: ['Global', 'Colors', 'Bot'],
                    initialValue: this.botColorBg,
                    onChange: (it)=>{
                        this.botColorBg = it.value;
                        /**@type {HTMLElement}*/(document.querySelector('.stac--panel')).style.setProperty('--botColorBg', this.botColorBg.toString());
                        this.save();
                    },
                }));
                this.settingList.push(ColorSetting.fromProps({ id: 'stac--botColorText',
                    name: 'Bot Message Text Color',
                    description: 'Text color for the bot message bubbles.',
                    category: ['Global', 'Colors', 'Bot'],
                    initialValue: this.botColorText,
                    onChange: (it)=>{
                        this.botColorText = it.value;
                        /**@type {HTMLElement}*/(document.querySelector('.stac--panel')).style.setProperty('--botColorText', this.botColorText.toString());
                        this.save();
                    },
                }));
                this.settingList.push(ColorSetting.fromProps({ id: 'stac--botColorBgHeader',
                    name: 'Bot Message Header Background Color',
                    description: 'Background color for the headers on bot message bubbles.',
                    category: ['Global', 'Colors', 'Bot'],
                    initialValue: this.botColorBgHeader,
                    onChange: (it)=>{
                        this.botColorBgHeader = it.value;
                        /**@type {HTMLElement}*/(document.querySelector('.stac--panel')).style.setProperty('--botColorBgHeader', this.botColorBgHeader.toString());
                        this.save();
                    },
                }));
                this.settingList.push(ColorSetting.fromProps({ id: 'stac--botColorTextHeader',
                    name: 'Bot Message Header Text Color',
                    description: 'Text color for the headers on bot message bubbles.',
                    category: ['Global', 'Colors', 'Bot'],
                    initialValue: this.botColorTextHeader,
                    onChange: (it)=>{
                        this.botColorTextHeader = it.value;
                        /**@type {HTMLElement}*/(document.querySelector('.stac--panel')).style.setProperty('--botColorTextHeader', this.botColorTextHeader.toString());
                        this.save();
                    },
                }));
                this.settingList.push(ColorSetting.fromProps({ id: 'stac--inputColorBg',
                    name: 'Chat Input Background Color',
                    description: 'Background color for the chat input field.',
                    category: ['Global', 'Colors'],
                    initialValue: this.inputColorBg,
                    onChange: (it)=>{
                        this.inputColorBg = it.value;
                        /**@type {HTMLElement}*/(document.querySelector('.stac--panel')).style.setProperty('--inputColorBg', this.inputColorBg.toString());
                        this.save();
                    },
                }));
                this.settingList.push(ColorSetting.fromProps({ id: 'stac--inputColorText',
                    name: 'Chat Input Text Color',
                    description: 'Text color for the chat input field.',
                    category: ['Global', 'Colors'],
                    initialValue: this.inputColorText,
                    onChange: (it)=>{
                        this.inputColorText = it.value;
                        /**@type {HTMLElement}*/(document.querySelector('.stac--panel')).style.setProperty('--inputColorText', this.inputColorText.toString());
                        this.save();
                    },
                }));
            }
        }
        { // chat
            this.settingList.push(MultilineTextSetting.fromProps({ id: 'stac--scriptBefore',
                name: 'Script Before',
                description: 'Script to be executed before a chat message is sent and a reply is generated.',
                category: ['Chat', 'Scripts'],
                initialValue: this.scriptBefore,
                onChange: (it)=>{
                    this.scriptBefore = it.value;
                    this.save();
                },
            }));
            this.settingList.push(MultilineTextSetting.fromProps({ id: 'stac--scriptAfter',
                name: 'Script After',
                description: 'Script to be executed after a chat message is sent and a reply is generated.',
                category: ['Chat', 'Scripts'],
                initialValue: this.scriptAfter,
                onChange: (it)=>{
                    this.scriptAfter = it.value;
                    this.save();
                },
            }));
            this.settingList.push(CustomSetting.fromProps({ id: 'stac--injectList',
                name: 'Injects',
                description: 'Injects to be inserted before a reply is generated. Will be removed afterwards.<br>Use <code>/inject ephemeral=true ...</code> in "Scripts Before" to set temporary injects that only affect ChatChat.',
                category: ['Chat', 'Injects'],
                initialValue: this.injectList,
                setValueCallback: (value)=>{},
                getValueCallback: ()=>[],
                renderCallback: ()=>{
                    const root = document.createElement('div'); {
                        root.textContent = 'NOT IMPLEMENTED';
                    }
                    return root;
                },
                onChange: (it)=>{},
            }));
            this.settingList.push(SelectSetting.fromProps({ id: 'stac--storyPosition',
                name: 'Story Position',
                description: 'Where in the context the story should be inserted. The story contains the text from all the bot messages between <code>&lt;story&gt;...&lt;/story&gt;</code> as a system/user message.',
                category: ['Chat', 'Story'],
                initialValue: this.storyPosition,
                optionList: Object.entries(STORY_POSITION).map(it=>({ value:it[1], label:it[1] })),
                onChange: (it)=>{
                    this.storyPosition = it.value;
                    this.save();
                },
            }));
            this.settingList.push(NumberSetting.fromProps({ id: 'stac--storyDepth',
                name: 'Story Depth',
                description: 'Depth at which the story should be inserted (if position is set to "in chat").',
                category: ['Chat', 'Story'],
                initialValue: this.storyDepth,
                min: 1,
                max: MAX_INJECTION_DEPTH,
                step: 1,
                onChange: (it)=>{
                    this.storyDepth = it.value;
                    this.save();
                },
            }));
            Message.defaultCharacter = this.character ?? characters[0]?.avatar;
            this.settingList.push(SelectSetting.fromProps({ id: 'stac--character',
                name: 'Character',
                description: 'The character you want to chat with.<br><small>No effect apart from changing the avatar (not persistent)</small>',
                category: ['Chat', 'Character'],
                initialValue: this.character ?? characters[0]?.avatar,
                optionList: characters.map(it=>({ value:it.avatar, label:it.name })),
                onChange: (it)=>{
                    Message.defaultCharacter = it.value;
                    this.character = it.value;
                    this.save();
                },
            }));
        }
    }

    save() {
        extension_settings.chatchat = {
            fontSize: this.fontSize,
            widthType: this.widthType,
            width: this.width,
            maxInputHistory: this.maxInputHistory,
            deleteAction: this.deleteAction,
            userColorBg: this.userColorBg,
            userColorText: this.userColorText,
            userColorBgHeader: this.userColorBgHeader,
            userColorTextHeader: this.userColorTextHeader,
            botColorBg: this.botColorBg,
            botColorText: this.botColorText,
            botColorBgHeader: this.botColorBgHeader,
            botColorTextHeader: this.botColorTextHeader,
            inputColorBg: this.inputColorBg,
            inputColorText: this.inputColorText,
        };
        saveSettingsDebounced();
        if (chat_metadata) {
            initMetadata();
            chat_metadata.chatchat.settings = {
                scriptBefore: this.scriptBefore,
                scriptAfter: this.scriptAfter,
                injectList: this.injectList,
                storyPosition: this.storyPosition,
                storyDepth: this.storyDepth,
                character: this.character,
                maxInputHistory: this.maxInputHistory,
                inputHistory: this.inputHistory,
                sectionList: this.sectionList,
            };
            saveMetadataDebounced();
        }
    }

    async init() {
        const response = await fetch('/scripts/extensions/third-party/SillyTavern-ChatChat/html/settings.html');
        if (!response.ok) {
            return console.warn('failed to fetch template: stac--settings.html');
        }
        const settingsTpl = document
            .createRange()
            .createContextualFragment(await response.text())
            .querySelector('#stac--settings-v2')
        ;
        const dom = /**@type {HTMLElement} */(settingsTpl.cloneNode(true));
        this.dom = dom;

        dom.querySelector('#stac--settings-close').addEventListener('click', ()=>{
            this.hide();
        });
        dom.querySelector('.contentWrapper').addEventListener('scroll', ()=>this.updateCategory());

        const search = /**@type {HTMLInputElement}*/(dom.querySelector('.search'));
        search.addEventListener('input', ()=>{
            const query = search.value.trim().toLowerCase();
            for (const setting of this.settingList) {
                if (setting.name.toLowerCase().includes(query) || setting.description.toLowerCase().includes(query)) {
                    setting.dom.classList.remove('hidden');
                } else {
                    setting.dom.classList.add('hidden');
                }
            }
            const cats = [...dom.querySelectorAll('.contentWrapper .category:has(.item:not(.hidden)) > .head')].map(it=>it.textContent);
            const heads = [...dom.querySelectorAll('.categoriesWrapper .category .head')];
            for (const head of heads) {
                if (cats.includes(head.textContent)) {
                    head.classList.remove('hidden');
                } else {
                    head.classList.add('hidden');
                }
            }
            this.updateCategory();
        });

        // build tree
        const tree = {};
        for (const setting of this.settingList) {
            let cur = tree;
            for (const key of setting.category) {
                if (!cur[key]) {
                    cur[key] = { name:key, settings:[] };
                }
                cur = cur[key];
            }
            cur.settings.push(setting);
        }

        // render tree
        const catRoot = /**@type {HTMLElement}*/(dom.querySelector('.categoriesWrapper'));
        const contRoot = /**@type {HTMLElement}*/(dom.querySelector('.contentWrapper'));
        const render = (cat, cont, cur, level = 0)=>{
            for (const key of Object.keys(cur)) {
                if (['name', 'settings'].includes(key)) continue;
                const curCat = cur[key];
                const block = document.createElement('div'); {
                    block.classList.add('category');
                    const head = document.createElement('div'); {
                        head.classList.add('head');
                        head.setAttribute('data-level', level.toString());
                        head.textContent = key;
                        block.append(head);
                    }
                }
                const catBlock = /**@type {HTMLElement}*/(block.cloneNode(true));
                catBlock.querySelector('.head').addEventListener('click', ()=>{
                    let offset = 0;
                    let head = /**@type {HTMLElement}*/(block.querySelector('.head'));
                    head = head.closest('.category').parentElement.closest('.category')?.querySelector('.head');
                    while (head) {
                        offset += head.offsetHeight;
                        head = head.closest('.category').parentElement.closest('.category')?.querySelector('.head');
                    }
                    contRoot.scrollTo({
                        top: block.offsetTop - offset,
                        behavior: 'smooth',
                    });
                });
                cat.append(catBlock);
                cont.append(block);
                for (const setting of curCat.settings) {
                    const item = setting.render();
                    block.append(item);
                }
                render(catBlock, block, curCat, level + 1);
            }
        };
        render(catRoot, contRoot, tree);
    }


    updateCategory() {
        const wrapRect = this.dom.querySelector('.contentWrapper').getBoundingClientRect();
        for (const setting of this.settingList) {
            const rect = setting.dom.getBoundingClientRect();
            if (rect.top > wrapRect.top || rect.top < wrapRect.top && rect.bottom > wrapRect.top + wrapRect.height / 4) {
                const cat = setting.dom.closest('.category').querySelector('.head').textContent;
                const heads = [...this.dom.querySelectorAll('.categoriesWrapper .head')];
                for (const head of heads) {
                    if (head.textContent == cat) {
                        let cur = head;
                        cur.classList.add('current');
                        while (cur) {
                            cur = cur.closest('.category').parentElement.closest('.category')?.querySelector('.head');
                            cur?.classList?.add('current');
                        }
                    } else {
                        head.classList.remove('current');
                    }
                }
                return;
            }
        }
    }

    async show(parent = document.body) {
        if (this.parent != parent) {
            this.parent = parent;
            parent.addEventListener('keydown', (evt)=>{
                if (!this.dom.classList.contains('stac--active')) return;
                const query = this.dom.querySelector('.search');
                const rect = query.getBoundingClientRect();
                if (document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) != query) return;
                if (evt.ctrlKey && evt.key == 'f') {
                    evt.preventDefault();
                    evt.stopPropagation();
                    /**@type {HTMLInputElement}*/(this.dom.querySelector('.search')).select();
                }
            });
        }
        parent.append(this.dom);
        this.dom.classList.add('stac--active');
        // this.dom.style.bottom = `calc(100dvh + 50px - ${document.querySelector('#form_sheld').getBoundingClientRect().top}px`;
        await delay(200);
        this.updateCategory();
        /**@type {HTMLInputElement}*/(this.dom.querySelector('.search')).select();
    }
    hide() {
        this.dom?.classList?.remove('stac--active');
        this.dom?.remove();
    }
    // async toggle(parent) {
    //     if (this.isActive) {
    //         this.hide();
    //     } else {
    //         await this.show(parent);
    //     }
    // }
}
