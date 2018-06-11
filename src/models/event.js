const Pathfinder = global.Pathfinder;
const db = require(Pathfinder.absPathInSrcFolder("mysql_models"));

let typeName;

let Event = function (type, postURI, userURI)
{
    typeName = type;
    this.postURI = postURI;
    this.userURI = userURI;
    return this;
};

Event.prototype.saveToMySQL = function (callback)
{
    const self = this;
    db.event_types.findAll({
        where: {
            name: typeName
        }
    }).then(res => {
        self.typeId = res[0].dataValues.id;
        db.events.create(self).then(() => {
            return callback(null);
        }).catch(err => {
            return callback(err);
        });
    });
};

Event.prototype.deleteFromMySQL = function (callback)
{
    const self = this;
    db.event_types.findAll({
        where: {
            name: typeName
        }
    }).then(res => {
        self.typeId = res[0].dataValues.id;
        db.events.destroy({
            where: {
                postURI: self.postURI,
                userURI: self.userURI,
                typeId: self.typeId
            }
        }).then(() => {
            return callback(null);
        }).catch(err => {
            return callback(err);
        });
    });
};

module.exports.Event = Event;