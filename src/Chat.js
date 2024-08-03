export class Chat {
    static from(props) {
        return Object.assign(new this(), props);
    }




    /**@type {string} */ title = 'New ChatChat';
    /**@type {number} */ createdOn = Date.now();
    /**@type {number} */ lastChatOn = Date.now();
    /**@type {object[]} */ messageList = [];
}
