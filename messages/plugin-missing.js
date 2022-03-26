"use strict";

module.exports = function(it) {
    const { pluginName, resolvePluginsRelativeTo, importerName } = it;

    return `
ec0int couldn't find the plugin "${pluginName}".

(The package "${pluginName}" was not found when loaded as a Node module from the directory "${resolvePluginsRelativeTo}".)

It's likely that the plugin isn't installed correctly. Try reinstalling by running the following:

    npm install ${pluginName}@latest --save-dev

The plugin "${pluginName}" was referenced from the config file in "${importerName}".

`.trimLeft();
};
