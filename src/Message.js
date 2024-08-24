import { messageFormatting } from '../../../../../script.js';
import { Popup, POPUP_TYPE } from '../../../../popup.js';
import { getMessageTimeStamp } from '../../../../RossAscends-mods.js';
import { delay } from '../../../../utils.js';
import { settings } from '../index.js';
import { waitForFrame } from './lib/wait.js';
import { DELETE_ACTION } from './Settings.js';



/** @readonly */
/** @enum {string} */
export const MESSAGE_TYPE = {
    /** A message added with the /comment command. */
    COMMENT: 'comment',
    /** A message added with the /sys command. */
    NARRATOR: 'narrator',
};
/**
 * @typedef ChatMessageExtra
 * @prop {string} [api] name of the API used
 * @prop {string} [model] name of the model used
 * @prop {number} [token_count] number of tokens
 * @prop {boolean} [isSmallSys] whether mesage will be rendered as "compact"
 * @prop {number} [gen_id]
 * @prop {MESSAGE_TYPE} [type] message type
 */
/**
 * @typedef ChatMessageSwipeInfo
 * @prop {string} [send_date] time when message was sent - getMessageTimeStamp()
 * @prop {string} [gen_started] time when the generation started - new Date().toString()
 * @prop {string} [gen_finished] time when the generation finishe - new Date().toString()
 * @prop {ChatMessageExtra} [extra] additional information about the message or swipe
 */
/**
 * @typedef ChatMessage
 * @prop {ChatMessageExtra} [extra] additional information about the message or swipe
 * @prop {string} [name] sender name
 * @prop {boolean} [is_user] whether message is from user
 * @prop {boolean} [is_system] whether mesage is hidden
 * @prop {string} [send_date] time when message was sent - getMessageTimeStamp()
 * @prop {string} [mes] message text
 * @prop {number} [swipe_id] current swipe index (0-based)
 * @prop {string[]} [swipes] list of message texts from swipes
 * @prop {ChatMessageSwipeInfo[]} [swipe] specific info that will be put into the message object for the active swipe
 * @prop {string} [gen_started] time when the generation started - new Date().toString()
 * @prop {string} [gen_finished] time when the generation finishe - new Date().toString()
 * @prop {string} [force_avatar]
 */


/**
 *
 * @param {string} mts
 * @returns {Date}
 */
const parseMessageTimeStamp = (mts)=>{
    // June 19, 2023 2:20pm
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const match = /^(?<month>\w+) (?<date>\d+), (?<year>\d+) (?<hour>\d+):(?<minute>\d+)(?<meridian>\w+)$/.exec(mts)?.groups;
    // if (!match) return new Date();
    const dt = new Date();
    dt.setFullYear(Number(match.year));
    dt.setMonth(months.indexOf(match.month));
    dt.setDate(Number(match.date));
    dt.setHours((Number(match.hour) % 12) + (match.meridian == 'am' ? 0 : 12));
    dt.setMinutes(Number(match.minute));
    dt.setSeconds(0);
    dt.setMilliseconds(0);
    return dt;
};



export class Swipe {
    /**
     * @returns {Swipe}
     */
    static from(props) {
        if (props.next) props.next = Message.from(props.next);
        const instance = Object.assign(new this(), props);
        return instance;
    }




    /**@type {ChatMessage} */ data = {};
    /**@type {Message} */ next;
    /**@type {string} */ character;

    /**@type {string} message text */
    get text() { return this.data.mes; }
    set text(value) { this.data.mes = value; }

    /**@type {string} message sender name */
    get name() { return this.data.name; }
    set name(value) { this.data.name = value; }

    /**@type {boolean} whether message is from user */
    get isUser() { return this.data.is_user; }
    set isUser(value) { this.data.is_user = value; }

    /**@type {boolean} whether message is hidden */
    get isSystem() { return this.data.is_system; }
    set isSystem(value) { this.data.is_system = value; }

    /**@type {string} time when message was sent - getMessageTimeStamp() */
    get sendDate() { return this.data.send_date; }
    set sendDate(value) { this.data.send_date = value; }

    /**@type {Message} */
    get leaf() { return this.next?.leaf; }


    toJSON() {
        return {
            data: this.data,
            next: this.next,
            character: this.character,
        };
    }
}



export class Message {
    /**@type {string} */
    static defaultCharacter;
    /**
     * @returns {Message}
     */
    static from(props) {
        delete props.dom;
        if (props.swipeList?.length) props.swipeList = props.swipeList.map(it=>Swipe.from(it));
        const instance = Object.assign(new this(), props);
        return instance;
    }




    /**
     * @param {string} text
     * @returns {Message}
     */
    static fromText(text) {
        const instance = new this();
        instance.addTextSwipe(text);
        return instance;
    }

    /**
     * @param {ChatMessage} mes
     */
    static fromChatMessage(mes) {
        const instance = new this();
        instance.addChatMesageSwipe(mes);
        return instance;
    }




    /**@type {Swipe[]} */ swipeList = [];
    /**@type {number} */ swipeIndex = -1;
    /**@type {boolean} */ isEditing = false;
    /**@type {HTMLElement} */ editor;

    /**@type {Swipe} */
    get swipe() { return this.swipeList[this.swipeIndex]; }

    /**@type {Message} */
    get next() { return this.swipe?.next; }
    set next(value) { this.swipe.next = value; }

    /**@type {Message} */
    get leaf() { return this.next?.leaf ?? this.next ?? this; }


    /**@type {string} message text */
    get character() { return this.swipe.character; }
    set character(value) { this.swipe.character = value; }

    /**@type {string} message text */
    get text() { return this.swipe.text; }
    set text(value) { this.swipe.text = value; }

    /**@type {string} message sender name */
    get name() { return this.swipe.name; }
    set name(value) { this.swipe.name = value; }

    /**@type {boolean} whether message is from user */
    get isUser() { return this.swipe.isUser; }
    set isUser(value) { this.swipe.isUser = value; }

    /**@type {boolean} whether message is hidden */
    get isSystem() { return this.swipe.isSystem; }
    set isSystem(value) { this.swipe.isSystem = value; }

    /**@type {string} time when message was sent - getMessageTimeStamp() */
    get sendDate() { return this.swipe.sendDate; }
    set sendDate(value) { this.swipe.sendDate = value; }


    /**@type {(deleteDescendants?:boolean)=>void} */ onDelete;
    /**@type {()=>void} */ onChange;
    /**@type {(oldSwipe:Swipe)=>void} */ onSwipe;
    /**@type {()=>void} */ onGenerate;

    #dom = {
        /**@type {HTMLElement} */
        root: undefined,
        /**@type {HTMLImageElement} */
        avatar: undefined,
        /**@type {HTMLElement} */
        date: undefined,
        /**@type {HTMLElement} */
        swipes: undefined,
        /**@type {HTMLElement} */
        content: undefined,
    };
    get dom() { return this.#dom; }


    toJSON() {
        return {
            swipeList: this.swipeList,
            swipeIndex: this.swipeIndex,
        };
    }




    /**
     * @param {string} text
     * @returns {Swipe}
     */
    addTextSwipe(text) {
        const swipe = new Swipe();
        swipe.text = text;
        swipe.sendDate = getMessageTimeStamp();
        if (this.swipe) {
            swipe.character ??= this.swipe.character;
            swipe.isSystem ??= this.swipe.isSystem;
            swipe.isUser ??= this.swipe.isUser;
            swipe.name ??= this.swipe.name;
        }
        return this.addSwipe(swipe);
    }

    /**
     * @param {ChatMessage} mes
     * @returns {Swipe}
     */
    addChatMesageSwipe(mes) {
        const swipe = new Swipe();
        swipe.data = mes;
        return this.addSwipe(swipe);
    }

    /**
     * @param {Swipe} swipe
     * @returns {Swipe}
     */
    addSwipe(swipe) {
        const oldSwipe = this.swipe;
        this.swipeList.push(swipe);
        this.swipeIndex = this.swipeList.length - 1;
        if (oldSwipe) {
            this.updateRender(oldSwipe.data);
            this.onSwipe(oldSwipe);
            this.onChange();
        }
        return swipe;
    }

    async goToSwipe(idx) {
        if (idx >= this.swipeList.length) throw new RangeError(`Swipe index out of range: ${idx} >= ${this.swipeList.length}`);
        const oldSwipe = this.swipe;
        this.swipeIndex = idx;
        this.updateRender(oldSwipe.data);
        this.onSwipe(oldSwipe);
        this.onChange();
    }

    async nextSwipe() {
        if (this.swipeIndex + 1 < this.swipeList.length) {
            // more existing swipes to the right
            const oldSwipe = this.swipe;
            this.swipeIndex++;
            this.updateRender(oldSwipe.data);
            this.onSwipe(oldSwipe);
            this.onChange();
        } else {
            // make new swipe
            if (this.isUser) {
                // add empty swipe and open editor
                const oldSwipe = this.swipe;
                this.addTextSwipe(this.swipe.text);
                this.swipe.isUser = true;
                this.updateRender(oldSwipe.data);
                this.onSwipe(oldSwipe);
                this.toggleEditor();
            } else {
                const oldSwipe = this.swipe;
                this.addTextSwipe('...');
                this.updateRender(oldSwipe.data);
                this.onSwipe(oldSwipe);
                this.onGenerate();
            }
        }
    }

    toggleEditor() {
        if (!this.isEditing) {
            this.isEditing = true;
            this.editor = document.createElement('div'); {
                this.editor.classList.add('stac--editor');
                this.editor.classList.add('stac--content');
                this.editor.classList.add('mes_text');
                this.editor.contentEditable = 'plaintext-only';
                this.editor.textContent = this.text;
                this.editor.addEventListener('keydown', (evt)=>{
                    evt.stopPropagation();
                    // ctrl+enter to save
                    if (evt.ctrlKey && evt.key == 'Enter' && !evt.shiftKey && !evt.altKey) {
                        this.toggleEditor();
                        return;
                    }
                    // escape to cancel
                    if (evt.key == 'Escape' && !evt.ctrlKey && !evt.shiftKey && !evt.altKey) {
                        this.editor.textContent = this.text;
                        this.toggleEditor()
                        return;
                    }
                });
                this.#dom.content.replaceWith(this.editor);
                // this.editor.focus();
            }
        } else {
            this.text = this.editor.textContent;
            this.#dom.content.innerHTML = this.messageFormatting();
            this.editor.replaceWith(this.#dom.content);
            this.editor = null;
            this.onChange();
            this.isEditing = false;
        }
    }

    /**
     * @param {ChatMessage} data
     */
    update(data) {
        const oldData = this.swipe.data;
        this.swipe.data = data;
        this.updateRender(oldData);
        this.onChange();
    }

    updateContent(html) {
        this.dom.content.innerHTML = html;
    }


    messageFormatting() {
        return messageFormatting(this.text, this.name, this.isSystem, this.isUser, -1);
    }

    /**
     * @returns {HTMLElement}
     */
    render() {
        if (!this.dom.root) {
            const root = document.createElement('div'); {
                this.dom.root = root;
                root.classList.add('stac--message');
                root.classList.add(`stac--${this.isUser ? 'user' : 'bot'}`);
                root.classList.add('mes');
                const details = document.createElement('div'); {
                    details.classList.add('stac--details');
                    if (!this.isUser) {
                        const ava = document.createElement('div'); {
                            ava.classList.add('stac--avatar');
                            const img = document.createElement('img'); {
                                this.dom.avatar = img;
                                img.classList.add('stac--avatarImg');
                                img.src = `/thumbnail?type=avatar&file=${this.character ?? Message.defaultCharacter}`;
                                ava.append(img);
                            }
                            details.append(ava);
                        }
                    }
                    const dt = document.createElement('div'); {
                        this.dom.date = dt;
                        dt.classList.add('stac--date');
                        dt.textContent = this.sendDate;
                        details.append(dt);
                    }
                    const actions = document.createElement('div'); {
                        actions.classList.add('stac--actions');
                        const del = document.createElement('div'); {
                            del.classList.add('stac--action');
                            del.classList.add('stac--delete');
                            del.classList.add('fa-solid', 'fa-trash-can');
                            del.title = settings.deleteAction;
                            let delMenu;
                            const hideDelMenu = async()=>{
                                delMenu.classList.remove('stac--active');
                                await delay(210);
                                delMenu.remove();
                                delMenu = null;
                            };
                            const showDelMenu = async()=>{
                                if (delMenu) {
                                    await hideDelMenu();
                                    return;
                                }
                                const menu = document.createElement('div'); {
                                    delMenu = menu;
                                    menu.classList.add('stac--delMenu');
                                    if (actions.getBoundingClientRect().top > window.innerHeight / 2) {
                                        menu.classList.add('stac--up');
                                    } else {
                                        menu.classList.add('stac--down');
                                    }
                                    const src = [this.isUser ? 'user' : 'bot', this.isUser ? 'bot' : 'user'];
                                    for (const t of Object.entries(DELETE_ACTION).filter(it=>it[1] != DELETE_ACTION.SHOW_MENU)) {
                                        const opt = document.createElement('div'); {
                                            opt.classList.add('stac--item');
                                            opt.classList.add(`stac--${t[0]}`);
                                            opt.title = t[1];
                                            opt.addEventListener('click', ()=>{
                                                hideDelMenu();
                                                performDelete(t[1]);
                                            });
                                            for (const idx of [1, 2, 3, 4]) {
                                                const m = document.createElement('div'); {
                                                    m.classList.add(`stac--${idx % 2 == 0 ? src[0] : [src[1]]}`);
                                                    opt.append(m);
                                                }
                                            }
                                            menu.append(opt);
                                        }
                                    }
                                    actions.append(menu);
                                    await waitForFrame();
                                    menu.classList.add('stac--active');
                                }
                            };
                            const performDelete = (da)=>{
                                switch (da) {
                                    case DELETE_ACTION.DELETE_MESSAGE: {
                                        this.onDelete(false);
                                        this.renderOut();
                                        break;
                                    }
                                    case DELETE_ACTION.DELETE_BRANCH: {
                                        this.onDelete(true);
                                        this.renderOut();
                                        break;
                                    }
                                    case DELETE_ACTION.DELETE_SWIPE: {
                                        if (this.swipeList.length < 2) return;
                                        const oldSwipe = this.swipe;
                                        this.swipeList.splice(this.swipeIndex, 1);
                                        if (this.swipeList.length > this.swipeIndex) {
                                            // swipes to the right available, switch to next swipe
                                        } else {
                                            this.swipeIndex--;
                                        }
                                        this.updateRender(oldSwipe.data);
                                        this.onSwipe(oldSwipe);
                                        this.onChange();
                                        break;
                                    }
                                }
                            };
                            del.addEventListener('click', async(evt)=>{
                                switch (settings.deleteAction) {
                                    case DELETE_ACTION.SHOW_MENU: {
                                        showDelMenu();
                                        break;
                                    }
                                    default: {
                                        performDelete(settings.deleteAction);
                                        break;
                                    }
                                }
                            });
                            del.addEventListener('contextmenu', async(evt)=>{
                                evt.preventDefault();
                                showDelMenu();
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
                                    navigator.clipboard.writeText(this.text);
                                    ok = true;
                                } catch {
                                    console.warn('/copy cannot use clipboard API, falling back to execCommand');
                                    const ta = document.createElement('textarea'); {
                                        ta.value = this.text;
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
                                if (this.swipeIndex == 0) return;
                                const oldSwipe = this.swipe;
                                this.swipeIndex--;
                                this.updateRender(oldSwipe.data);
                                this.onSwipe(oldSwipe);
                                this.onChange();
                            });
                            actions.append(swipeLeft);
                        }
                        const swipes = document.createElement('div'); {
                            this.dom.swipes = swipes;
                            swipes.classList.add('stac--info');
                            swipes.classList.add('stac--swipesCount');
                            swipes.textContent = `${this.swipeIndex + 1} / ${(this.swipeList.length)}`;
                            swipes.title = 'Manage swipes / branches';
                            swipes.addEventListener('click', async()=>{
                                const dom = document.createElement('div'); {
                                    dom.classList.add('stac--swipesDlg');
                                    for (const swipe of this.swipeList) {
                                        const branch = document.createElement('div'); {
                                            branch.classList.add('stac--branch');
                                            const actions = document.createElement('div'); {
                                                actions.classList.add('stac--actions');
                                                const sel = document.createElement('div'); {
                                                    sel.classList.add('stac--action');
                                                    sel.classList.add('menu_button');
                                                    sel.classList.add('fa-solid', 'fa-fw');
                                                    sel.classList.add('fa-angles-right');
                                                    sel.title = 'Switch to this swipe';
                                                    sel.addEventListener('click', async()=>{
                                                        const oldSwipe = this.swipe;
                                                        this.swipeIndex = this.swipeList.indexOf(swipe);
                                                        this.updateRender(oldSwipe.data);
                                                        this.onSwipe(oldSwipe);
                                                        this.onChange();
                                                        dlg.completeAffirmative();
                                                    });
                                                    actions.append(sel);
                                                }
                                                const del = document.createElement('div'); {
                                                    del.classList.add('stac--action');
                                                    del.classList.add('menu_button');
                                                    del.classList.add('fa-solid', 'fa-fw');
                                                    del.classList.add('fa-trash-can');
                                                    del.title = 'Delete branch (swipe and follow-up messages)';
                                                    del.addEventListener('click', async()=>{
                                                        if (this.swipeList.length < 2) return;
                                                        const oldSwipe = this.swipe;
                                                        const idx = this.swipeList.indexOf(swipe);
                                                        this.swipeList.splice(idx, 1);
                                                        if (this.swipeIndex > idx) this.swipeIndex--;
                                                        else if (this.swipeIndex == idx) {
                                                            if (this.swipeList.length > this.swipeIndex) {
                                                            // swipes to the right available, switch to next swipe
                                                            } else {
                                                                this.swipeIndex--;
                                                            }
                                                        }
                                                        this.updateRender(oldSwipe.data);
                                                        this.onSwipe(oldSwipe);
                                                        this.onChange();
                                                        branch.remove();
                                                    });
                                                    actions.append(del);
                                                }
                                                branch.append(actions);
                                            }
                                            const messages = document.createElement('div'); {
                                                messages.classList.add('stac--messages');
                                                let s = swipe;
                                                while (s) {
                                                    const mes = document.createElement('div'); {
                                                        mes.classList.add('stac--message');
                                                        mes.classList.add(`stac--${s.isUser ? 'user' : 'bot'}`);
                                                        mes.classList.add('mes');
                                                        const actions = document.createElement('div'); {
                                                            actions.classList.add('stac--actions');
                                                            const fold = document.createElement('div'); {
                                                                fold.classList.add('stac--action');
                                                                fold.classList.add('menu_button');
                                                                fold.classList.add('fa-solid', 'fa-fw');
                                                                fold.classList.add('fa-caret-down');
                                                                fold.title = 'Collapse messages';
                                                                fold.addEventListener('click', ()=>mes.classList.toggle('stac--collapsed'));
                                                                actions.append(fold);
                                                            }
                                                            mes.append(actions);
                                                        }
                                                        const txt = document.createElement('div'); {
                                                            txt.classList.add('stac--content');
                                                            txt.classList.add('mes_text');
                                                            txt.innerHTML = messageFormatting(s.text, s.name, s.isSystem, s.isUser, -1);
                                                            mes.append(txt);
                                                        }
                                                        messages.append(mes);
                                                    }
                                                    s = s.next?.swipe;
                                                }
                                                branch.append(messages);
                                            }
                                            dom.append(branch);
                                        }
                                    }
                                }
                                const dlg = new Popup(dom, POPUP_TYPE.TEXT);
                                await dlg.show();
                            });
                            actions.append(swipes);
                        }
                        const swipeRight = document.createElement('div'); {
                            swipeRight.classList.add('stac--action');
                            swipeRight.classList.add('stac--swipeRight');
                            swipeRight.classList.add('fa-solid', 'fa-chevron-right');
                            swipeRight.title = 'Show or generate / write next swipe';
                            swipeRight.addEventListener('click', ()=>this.nextSwipe());
                            actions.append(swipeRight);
                        }
                        const edit = document.createElement('div'); {
                            edit.classList.add('stac--action');
                            edit.classList.add('fa-solid', 'fa-pencil');
                            edit.title = 'Edit message';
                            edit.addEventListener('click', ()=>this.toggleEditor());
                            actions.append(edit);
                        }
                        details.append(actions);
                    }
                    root.append(details);
                }
                const txt = document.createElement('div'); {
                    this.dom.content = txt;
                    txt.classList.add('stac--content');
                    txt.classList.add('mes_text');
                    txt.innerHTML = this.messageFormatting();
                    root.append(txt);
                }
            }
        }
        return this.dom.root;
    }

    async renderOut() {
        this.dom.root.classList.add('stac--remove');
        await delay(410);
        this.dom.root.remove();
        this.dom.root.classList.remove('stac--remove');
    }

    /**
     * @param {ChatMessage} [oldProps]
     */
    updateRender(oldProps = null) {
        this.render();
        if (oldProps && oldProps.send_date != this.sendDate) this.dom.date.textContent = this.sendDate;
        if (oldProps && oldProps.mes != this.text) this.dom.content.innerHTML = this.messageFormatting();
        this.dom.swipes.textContent = `${this.swipeIndex + 1} / ${(this.swipeList.length)}`;
        if (this.dom.avatar) this.dom.avatar.src = `/thumbnail?type=avatar&file=${this.character ?? Message.defaultCharacter}`;
    }
}
