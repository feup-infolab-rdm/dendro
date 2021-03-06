const uuid = require("uuid");
const rlequire = require("rlequire");
const slug = rlequire("dendro", "src/utils/slugifier.js");

const b2dropProjectHandle = "b2droproject" + Math.random().toString(36).substr(2, 5);
const Config = rlequire("dendro", "src/models/meta/config.js").Config;
const fileUtils = rlequire("dendro", "test/utils/file/fileUtils.js");

const projectData = {
    creator: "http://" + Config.hostAndPort + "/user/demouser1",
    title: "This is a project with b2drop storage , with handle " + b2dropProjectHandle + " and created by demouser1",
    description: "A b2drop-backed project with a single folder and a file inside it",
    publisher: "Universidade do Porto",
    contact_address: "Casa do João Numero 1",
    contact_name: "Joãozinho Autor",
    contact_phone: "910000000",
    contact_email: "joao@casa.com",
    language: "en",
    coverage: "Porto",
    handle: b2dropProjectHandle,
    privacy: "public",
    storageConfig: {
        hasStorageType: "b2drop",
        username: "joaorosilva@gmail.com",
        password: "bxf8f-4P8WP-HbCiT-eDX5t-LfGZb"
    },
    uri: "http://" + Config.hostAndPort + "/" + b2dropProjectHandle,
    backup_path: fileUtils.getFilePath("/mockdata/projects/projectBackups/b2droproject.zip")
};

module.exports = projectData;
