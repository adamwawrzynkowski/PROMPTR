const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// This preload script only handles image paths
contextBridge.exposeInMainWorld('imageLoader', {
    getImagePath: (imageName) => {
        if (process.env.NODE_ENV === 'development') {
            return path.join(__dirname, 'assets', imageName);
        }
        return path.join(process.resourcesPath, imageName);
    }
});
