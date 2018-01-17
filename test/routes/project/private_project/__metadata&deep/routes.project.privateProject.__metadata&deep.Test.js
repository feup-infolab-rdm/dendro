const chai = require("chai");
const chaiHttp = require("chai-http");
const should = chai.should();
const _ = require("underscore");
chai.use(chaiHttp);

const Pathfinder = global.Pathfinder;
const Config = require(Pathfinder.absPathInSrcFolder("models/meta/config.js")).Config;

const userUtils = require(Pathfinder.absPathInTestsFolder("utils/user/userUtils.js"));
const itemUtils = require(Pathfinder.absPathInTestsFolder("utils/item/itemUtils.js"));
const projectUtils = require(Pathfinder.absPathInTestsFolder("utils/project/projectUtils.js"));
const repositoryUtils = require(Pathfinder.absPathInTestsFolder("utils/repository/repositoryUtils.js"));
const appUtils = require(Pathfinder.absPathInTestsFolder("utils/app/appUtils.js"));

const demouser1 = require(Pathfinder.absPathInTestsFolder("mockdata/users/demouser1.js"));
const demouser2 = require(Pathfinder.absPathInTestsFolder("mockdata/users/demouser2.js"));
const demouser3 = require(Pathfinder.absPathInTestsFolder("mockdata/users/demouser3.js"));

const privateProject = require(Pathfinder.absPathInTestsFolder("mockdata/projects/private_project.js"));
const invalidProject = require(Pathfinder.absPathInTestsFolder("mockdata/projects/invalidProject.js"));

const addMetadataToFoldersUnit = appUtils.requireUncached(Pathfinder.absPathInTestsFolder("units/metadata/addMetadataToFolders.Unit.js"));
const db = appUtils.requireUncached(Pathfinder.absPathInTestsFolder("utils/db/db.Test.js"));

describe("Private project level metadata&deep tests", function ()
{
    this.timeout(Config.testsTimeout);
    before(function (done)
    {
        addMetadataToFoldersUnit.setup(function (err, results)
        {
            should.equal(err, null);
            done();
        });
    });

    describe(privateProject.handle + "?metadata&deep (private project)", function ()
    {
        /**
         * Invalid request type
         */
        it("[HTML] should refuse request if Accept application/json was not specified", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                projectUtils.getProjectMetadataDeep(false, agent, privateProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(400);
                    should.not.exist(res.body.descriptors);
                    should.not.exist(res.body.hasLogicalParts);
                    done();
                });
            });
        });

        /**
         * Valid request type
         */
        it("[JSON] should NOT fetch metadata recursively of the" + privateProject.handle + " project without authenticating", function (done)
        {
            const app = global.tests.app;
            const agent = chai.request.agent(app);
            projectUtils.getProjectMetadataDeep(true, agent, privateProject.handle, function (err, res)
            {
                res.statusCode.should.equal(401);
                should.not.exist(res.body.descriptors);
                should.not.exist(res.body.hasLogicalParts);
                done();
            });
        });

        it("[JSON] should fetch metadata recursively of the " + privateProject.handle + " project, authenticated as " + demouser1.username + " (creator)", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                projectUtils.getProjectMetadataDeep(true, agent, privateProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(200);
                    res.body.descriptors.should.be.instanceof(Array);
                    res.body.hasLogicalParts.should.be.instanceof(Array);// only because this is a metadata&deep request
                    done();
                });
            });
        });

        it("[JSON] should NOT fetch metadata recursively of the " + privateProject.handle + " project, authenticated as " + demouser3.username + " (not user nor contributor)", function (done)
        {
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent)
            {
                projectUtils.getProjectMetadataDeep(true, agent, privateProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(401);
                    should.not.exist(res.body.descriptors);
                    should.not.exist(res.body.hasLogicalParts);
                    done();
                });
            });
        });

        it("[JSON] should fetch metadata of the " + privateProject.handle + " project, authenticated as " + demouser2.username + " (contributor)", function (done)
        {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent)
            {
                projectUtils.getProjectMetadataDeep(true, agent, privateProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(200);
                    res.body.descriptors.should.be.instanceof(Array);
                    res.body.hasLogicalParts.should.be.instanceof(Array);// only because this is a metadata&deep request
                    done();
                });
            });
        });
    });

    describe(invalidProject.handle + "?metadata&deep (non-existant project)", function ()
    {
        it("[HTML] should refuse request if Accept application/json was not specified", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                projectUtils.getProjectMetadataDeep(false, agent, invalidProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(400);
                    should.not.exist(res.body.descriptors);
                    should.not.exist(res.body.hasLogicalParts);
                    done();
                });
            });
        });

        it("[JSON] should give a 404 because the project NON_EXISTENT_PROJECT does not exist", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                projectUtils.getProjectMetadataDeep(true, agent, invalidProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(404);
                    should.not.exist(res.body.descriptors);
                    should.not.exist(res.body.hasLogicalParts);

                    res.body.result.should.equal("not_found");
                    res.body.message.should.be.an("array");
                    res.body.message.length.should.equal(1);
                    res.body.message[0].should.contain("Resource not found at uri ");
                    res.body.message[0].should.contain(testFolder1.name);
                    res.body.message[0].should.contain(invalidProject.handle);
                    done();
                });
            });
        });
    });

    after(function (done)
    {
        // destroy graphs

        appUtils.clearAppState(function (err, data)
        {
            should.equal(err, null);
            done(err);
        });
    });
});
