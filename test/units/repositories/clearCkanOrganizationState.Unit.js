process.env.NODE_ENV = 'test';

const Pathfinder = global.Pathfinder;
const async = require("async");
const Config = require(Pathfinder.absPathInSrcFolder("models/meta/config.js")).Config;
const isNull = require(Pathfinder.absPathInSrcFolder(path.join("utils", "null.js"))).isNull;
const userUtils = require(Pathfinder.absPathInTestsFolder("utils/user/userUtils.js"));
const repositoryUtils = require(Pathfinder.absPathInTestsFolder("utils/repository/repositoryUtils.js"));
const ckanUtils = require(Pathfinder.absPathInTestsFolder("utils/repository/ckanUtils.js"));

const demouser1 = require(Pathfinder.absPathInTestsFolder("mockdata/users/demouser1"));

const ckan = require(Pathfinder.absPathInTestsFolder("mockdata/repositories/dataToCreate/ckan"));
const ckanOrganizationData = require(Pathfinder.absPathInTestsFolder("mockdata/repositories/dataToCreate/ckanOrganizationData"));

function requireUncached(module) {
    delete require.cache[require.resolve(module)]
    return require(module)
}

module.exports.setup = function (finish) {
    console.log("At clearCkanOrganizationStateUnit");
    let uploadFilesToFoldersUnit = requireUncached(Pathfinder.absPathInTestsFolder("units/repositories/uploadFilesToFolders.Unit.js"));

    uploadFilesToFoldersUnit.setup(function (err, results) {
        if (err) {
            finish(err, results);
        }
        else {
            console.log("Running clearCkanOrganizationDateUnit");
            ckanUtils.deleteAllPackagesFromOrganization(true, agent, ckan, ckanOrganizationData, function (err, data) {
                if(err)
                {
                    console.error("Error deleting all packages from ckan organization");
                    finish(err, data);
                }
                else
                {
                    /*ckanUtils.deleteCkanOrganization(true, agent, ckan, ckanOrganizationData, function (err, data) {
                        if(err)
                        {
                            finish(err, data);
                        }
                        else
                        {
                            ckanUtils.createCkanOrganization(true, agent, ckan, ckanOrganizationData, function (err, data) {
                                finish(err, data);
                            })
                        }
                    })*/

                    console.log("Deleted all packages from ckan organization successfully");
                    ckanUtils.createCkanOrganization(true, agent, ckan, ckanOrganizationData, function (err, data) {
                        if(err)
                        {
                            if(data.error.name[0] === "Group name already exists in database")
                            {
                                finish(null, data);
                            }
                            else
                            {
                                finish(err, data);
                            }
                        }
                        else
                        {
                            finish(err, data);
                        }
                    })
                }
            });
        }
    });
};
