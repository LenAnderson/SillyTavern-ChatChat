import { characters, getRequestHeaders, this_chid } from '../../../../../script.js';
import { groups, selected_group } from '../../../../group-chats.js';
import { uuidv4 } from '../../../../utils.js';
import { waitForFrame } from './lib/wait.js';
import { Message } from './Message.js';

export class Chat {
    /**
     *
     * @param {object} props
     * @returns {Chat}
     */
    static from(props) {
        delete props.dom;
        if (props.rootMessage) props.rootMessage = Message.from(props.rootMessage);
        const instance = Object.assign(new this(), props);

        let msg = instance.rootMessage;
        while (msg) {
            instance.hookMessage(msg);
            msg = msg.next;
        }
        return instance;
    }

    static async load({ subdir, id }) {
        const response = await fetch('/api/plugins/files/get', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                path: `~/user/ChatChat/${subdir}/${id}.ChatChat.json`,
            }),
        });
        if (!response.ok) {
            console.warn('[STAC]', `something went wrong\n[${response.statusText}] ${response.status}`);
            return new Chat();
        }
        return Chat.from(await response.json());
    }




    /**@type {string} */ subdir = (selected_group ? groups.find(it=>it.id == selected_group)?.name : characters[this_chid]?.name) ?? '__UNKNOWN__';
    /**@type {string} */ id = uuidv4();
    /**@type {string} */ title = 'New ChatChat';
    /**@type {number} */ createdOn = Date.now();
    /**@type {number} */ lastChatOn = Date.now();
    /**@type {Message} */ rootMessage;

    get file() {
        return {
            subdir: this.subdir,
            id: this.id,
            title: this.title,
            createdOn: this.createdOn,
            lastChatOn: this.lastChatOn,
            firstMessageOn: this.firstMessageOn,
            lastMessageOn: this.lastMessageOn,
            messageCount: this.messageCount,
        };
    }

    /**@type {Message} */
    get leafMessage() { return this.rootMessage?.leaf; }

    get firstMessageOn() { return this.rootMessage?.sendDate ?? ''; }
    get lastMessageOn() { return this.leafMessage?.sendDate ?? ''; }
    get messageCount() {
        let cnt = 0;
        let m = this.rootMessage;
        while (m) {
            cnt++;
            m = m.next;
        }
        return cnt;
    }


    /**@type {()=>void} */ onChange;
    /**@type {()=>void} */ onGenerate;


    dom = {
        /**@type {HTMLElement} */
        root: undefined,
    };


    toJSON() {
        return {
            id: this.id,
            title: this.title,
            createdOn: this.createdOn,
            lastChatOn: this.lastChatOn,
            rootMessage: this.rootMessage,
        };
    }

    equals(that) {
        return that.subdir == this.subdir && that.id == this.id;
    }

    async save() {
        if (this.title == 'New ChatChat' && !this.rootMessage) return;
        const subdir = this.subdir;
        const blob = new Blob([JSON.stringify(this)], { type:'text' });
        const reader = new FileReader();
        const prom = new Promise(resolve=>reader.addEventListener('load', resolve));
        reader.readAsDataURL(blob);
        await prom;
        const putResponse = await fetch('/api/plugins/files/put', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                path: `~/user/ChatChat/${subdir}/${this.id}.ChatChat.json`,
                file: reader.result,
            }),
        });
        if (!putResponse.ok) {
            console.warn('[STAC]', `something went wrong\n[${putResponse.statusText}] ${putResponse.status}`);
            return;
        }
    }



    findParent(message) {
        if (message == this.rootMessage) return null;
        let p = this.rootMessage;
        while (p && p.next != message) {
            p = p.next;
        }
        return p;
    }

    toFlat() {
        const list = [];
        let m = this.rootMessage;
        while (m) {
            list.push(Message.from(JSON.parse(JSON.stringify(m))));
            m = m.next;
        }
        return list;
    }



    /**
     * @param {Message} message
     * @returns {Message}
     */
    addMessage(message) {
        this.hookMessage(message);
        if (!this.rootMessage) {
            this.rootMessage = message;
        } else {
            this.leafMessage.swipe.next = message;
        }
        this.onChange();

        if (this.dom.root) this.dom.root.prepend(message.render());

        return message;
    }

    /**
     *
     * @param {Message} message
     */
    hookMessage(message) {
        message.onChange = ()=>this.onChange();
        message.onDelete = (deleteDescendants)=>{
            const parent = this.findParent(message);
            if (deleteDescendants) {
                let m = message.next;
                while (m) {
                    m.renderOut();
                    m = m.next;
                }
            }
            if (parent) {
                parent.next = deleteDescendants === true ? null : message.next;
            } else {
                this.rootMessage = deleteDescendants === true ? null : message.next;
            }
            this.onChange();
        };
        message.onSwipe = async(oldSwipe)=>{
            const oRect = message.dom.root.getBoundingClientRect();
            let m = oldSwipe.next;
            const domProms = [];
            while (m) {
                domProms.push(m.renderOut());
                m = m.next;
            }
            m = message.next;
            const frag = document.createDocumentFragment();
            while (m) {
                this.hookMessage(m);
                frag.prepend(m.render());
                m = m.next;
            }
            this.dom.root.prepend(frag);
            await waitForFrame();
            const nRect = message.dom.root.getBoundingClientRect();
            const offset = oRect.top - nRect.top;
            this.dom.root.scrollTop -= offset;
            await Promise.all(domProms).then(()=>{
                const nRect = message.dom.root.getBoundingClientRect();
                const offset = oRect.top - nRect.top;
                this.dom.root.scrollTop -= offset;
            });
        };
        message.onGenerate = async()=>this.onGenerate();
    }


    /**
     * @param {HTMLElement} [root]
     * @returns {HTMLElement}
     */
    render(root = null) {
        if (root) this.dom.root = root;
        if (!root) throw new Error('no root');

        root.innerHTML = '';
        let msg = this.rootMessage;
        while (msg) {
            root.prepend(msg.render());
            msg = msg.next;
        }
        return this.dom.root;
    }
}
