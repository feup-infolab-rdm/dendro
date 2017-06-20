const Config = function () {
    return GLOBAL.Config;
}();

const isNull = require(Config.absPathInSrcFolder("/utils/null.js")).isNull;
const Class = require(Config.absPathInSrcFolder("/models/meta/class.js")).Class;
const DbConnection = require(Config.absPathInSrcFolder("/kb/db.js")).DbConnection;
const Resource = require(Config.absPathInSrcFolder("/models/resource.js")).Resource;
const Descriptor = require(Config.absPathInSrcFolder("/models/meta/descriptor.js")).Descriptor;
const Event = require(Config.absPathInSrcFolder("/models/social/event.js")).Event;
const uuid = require('uuid');

const db = function () {
    return GLOBAL.db.default;
}();
const db_social = function () {
    return GLOBAL.db.social;
}();

const gfs = function () {
    return GLOBAL.gfs.default;
}();
const async = require('async');

function Comment (object)
{
    Comment.baseConstructor.call(this, object);
    let self = this;

    self.copyOrInitDescriptors(object);

    self.rdf.type = "ddr:Comment";

    if(!isNull(object.uri))
    {
        self.uri = object.uri;
    }
    else
    {
        self.uri = Config.baseUri + "/comments/" + uuid.v4();
    }

    return self;
}

Comment = Class.extend(Comment, Event);

module.exports.Comment = Comment;


