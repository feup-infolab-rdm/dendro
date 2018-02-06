process.env.NODE_ENV = "test";

const Pathfinder = global.Pathfinder;
const Config = require(Pathfinder.absPathInSrcFolder("models/meta/config.js")).Config;

const chai = require("chai");
chai.use(require("chai-http"));
const should = chai.should();
const async = require("async");
const path = require("path");

const projectUtils = require(Pathfinder.absPathInTestsFolder("utils/project/projectUtils.js"));
const userUtils = require(Pathfinder.absPathInTestsFolder("utils/user/userUtils.js"));
const appUtils = require(Pathfinder.absPathInTestsFolder("utils/app/appUtils.js"));
const unitUtils = require(Pathfinder.absPathInTestsFolder("utils/units/unitUtils.js"));

const demouser1 = require(Pathfinder.absPathInTestsFolder("mockdata/users/demouser1"));

const publicProjectData = require(Pathfinder.absPathInTestsFolder("mockdata/projects/public_project.js"));
const metadataOnlyProjectData = require(Pathfinder.absPathInTestsFolder("mockdata/projects/metadata_only_project.js"));
const privateProjectData = require(Pathfinder.absPathInTestsFolder("mockdata/projects/private_project.js"));
const projectCreatedByDemoUser3 = require(Pathfinder.absPathInTestsFolder("mockdata/projects/private_project_created_by_demouser3.js"));

const publicProjectForHTMLTestsData = require(Pathfinder.absPathInTestsFolder("mockdata/projects/public_project_for_html.js"));
const metadataOnlyProjectForHTMLTestsData = require(Pathfinder.absPathInTestsFolder("mockdata/projects/metadata_only_project_for_html.js"));
const privateProjectForHTMLTestsData = require(Pathfinder.absPathInTestsFolder("mockdata/projects/private_project_for_html.js"));

const projectsData = module.exports.projectsData = [publicProjectData, metadataOnlyProjectData, privateProjectData, publicProjectForHTMLTestsData, metadataOnlyProjectForHTMLTestsData, privateProjectForHTMLTestsData, projectCreatedByDemoUser3];

module.exports.setup = function (finish)
{
    unitUtils.loadCheckpointAndRun(
        path.basename(__filename),
        function (err, restoreMessage)
        {
            unitUtils.start(path.basename(__filename), restoreMessage);
            let createUsersUnit = appUtils.requireUncached(Pathfinder.absPathInTestsFolder("units/users/createUsers.Unit.js"));

            createUsersUnit.setup(function (err, results)
            {
                if (err)
                {
                    finish(err, results);
                }
                else
                {
                    async.mapSeries(projectsData, function (projectData, cb)
                    {
                        userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
                        {
                            if (err)
                            {
                                cb(err, agent);
                            }
                            else
                            {
                                projectUtils.createNewProject(true, agent, projectData, function (err, res)
                                {
                                    cb(err, res);
                                });
                            }
                        });
                    }, function (err, results)
                    {
                        finish(err, results);
                        unitUtils.end(__filename);
                    });
                }
            });
        },
        function ()
        {
            unitUtils.end(__filename);
            finish(err, results);
        });
};
