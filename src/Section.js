export class Section {
    /**
     *
     * @param {{separator:string, isIncluded:boolean}} props
     * @returns {Section}
     */
    static from(props) {
        return Object.assign(new Section(), props);
    }

    static create(separator) {
        const instance = new Section();
        instance.separator = separator;
        return instance;
    }




    /**@type {string} */ separator;
    /**@type {boolean} */ isIncluded = true;
}
