process.env.NODE_ENV = "test";

const chai = require("chai");
const chaiHttp = require("chai-http");
const path = require("path");
chai.use(chaiHttp);

const Pathfinder = global.Pathfinder;
const Logger = require(Pathfinder.absPathInSrcFolder("utils/logger.js")).Logger;
const isNull = require(Pathfinder.absPathInSrcFolder("/utils/null.js")).isNull;

const should = chai.should();

const TestUnit = require(Pathfinder.absPathInTestsFolder("units/testUnit.js"));
const App = require(Pathfinder.absPathInSrcFolder("bootup/app.js")).App;
const dendroInstance = new App();

class BootupUnit extends TestUnit
{
    static init (callback)
    {
        super.init(function (err, result)
        {
            dendroInstance.startApp(function (err, appInfo)
            {
                if (isNull(err))
                {
                    chai.request(appInfo.app)
                        .get("/")
                        .end((err, res) =>
                        {
                            global.tests.app = appInfo.app;
                            global.tests.server = appInfo.server;
                            should.not.exist(err);
                            callback(err, res);
                        });
                }
                else
                {
                    Logger.log("error", "Error seeding databases!");
                    Logger.log("error", JSON.stringify(err));
                    callback(err);
                }
            });
        });
    }

    static shutdown (callback)
    {
        super.shutdown(function (err, result)
        {
            //TODO
            dendroInstance.freeResources(function (err, result)
            {
                callback(err);
            });
        });
    }

    static load (callback)
    {
        const self = this;
        self.startLoad(path.basename(__filename));
        super.load(function (err, results)
        {
            if (err)
            {
                callback(err, results);
            }
            else
            {
                dendroInstance.initConnections(function (err, appInfo)
                {
                    if (isNull(err))
                    {
                        dendroInstance.seedDatabases(function (err, results)
                        {
                            if (!err)
                            {
                                callback(null, appInfo);
                            }
                            else
                            {
                                callback(err, results);
                            }

                            self.shutdown(function(err, result){
                                if(!err)
                                {
                                    self.endLoad(path.basename(__filename));
                                }
                                else
                                {
                                    throw new Error(err);
                                }
                            });
                        });
                    }
                    else
                    {
                        Logger.log("error", "Error seeding databases!");
                        Logger.log("error", JSON.stringify(err));
                        callback(err);
                    }
                });
            }
        });
    }
}

module.exports = BootupUnit;
