// storage.js

/**
 * Local Storage Management
 */

const LocalStorage = {
    setItem: (key, value) => {
        localStorage.setItem(key, JSON.stringify(value));
    },
    getItem: (key) => {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
    },
    removeItem: (key) => {
        localStorage.removeItem(key);
    }
};

/**
 * Hunt Basket Management
 */

const HuntBasket = {
    addItem: (item) => {
        const basket = LocalStorage.getItem('huntBasket') || [];
        basket.push(item);
        LocalStorage.setItem('huntBasket', basket);
    },
    removeItem: (item) => {
        let basket = LocalStorage.getItem('huntBasket') || [];
        basket = basket.filter(basketItem => basketItem !== item);
        LocalStorage.setItem('huntBasket', basket);
    },
    getItems: () => {
        return LocalStorage.getItem('huntBasket') || [];
    },
    clear: () => {
        LocalStorage.removeItem('huntBasket');
    }
};

export { LocalStorage, HuntBasket };