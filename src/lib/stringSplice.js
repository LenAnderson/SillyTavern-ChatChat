export const stringSplice = (str, start, deleteCount, ...items)=>{
    const list = [...str];
    list.splice(start, deleteCount, ...items);
    return list.join('');
};
