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

const metadataProject = require(Pathfinder.absPathInTestsFolder("mockdata/projects/metadata_only_project.js"));
const invalidProject = require(Pathfinder.absPathInTestsFolder("mockdata/projects/invalidProject.js"));

const addMetadataToFoldersUnit = appUtils.requireUncached(Pathfinder.absPathInTestsFolder("units/metadata/addMetadataToFolders.Unit.js"));
const db = appUtils.requireUncached(Pathfinder.absPathInTestsFolder("utils/db/db.Test.js"));

describe("Metadata only project level metadata_recommendations", function ()
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

    /**
     * Project-level recommendation of descriptors
     */
    describe(metadataProject.handle + "?metadata_recommendations", function ()
    {
        it("[HTML] should refuse the request if \"application/json\" Accept header is absent", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                projectUtils.getMetadataRecomendationsForProject(false, agent, metadataProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(400);
                    should.not.exist(res.body.descriptors);
                    done();
                });
            });
        });

        it("[JSON] should forbid requests for recommendations in project " + metadataProject.handle + " if no user is authenticated.", function (done)
        {
            const app = global.tests.app;
            const agent = chai.request.agent(app);

            projectUtils.getMetadataRecomendationsForProject(true, agent, metadataProject.handle, function (err, res)
            {
                res.statusCode.should.equal(401);
                should.not.exist(res.body.descriptors);
                done();
            });
        });

        it("[JSON] should allow requests for recommendations in project " + metadataProject.handle + " if user " + demouser1.username + " is authenticated (creator).", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                projectUtils.getMetadataRecomendationsForProject(true, agent, metadataProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(200);
                    res.body.descriptors.should.be.instanceof(Array);
                    done();
                });
            });
        });

        it("[JSON] should allow requests for recommendations in project " + metadataProject.handle + " if user " + demouser2.username + " is authenticated (contributor).", function (done)
        {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent)
            {
                projectUtils.getMetadataRecomendationsForProject(true, agent, metadataProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(200);
                    res.body.descriptors.should.be.instanceof(Array);
                    done();
                });
            });
        });

        it("[JSON] should allow requests for recommendations in project " + metadataProject.handle + " if user " + demouser3.username + " is authenticated (not contributor nor creator).", function (done)
        {
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent)
            {
                projectUtils.getMetadataRecomendationsForProject(true, agent, metadataProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(200);
                    res.body.descriptors.should.be.instanceof(Array);
                    done();
                });
            });
        });
    });

    describe(invalidProject.handle + "?metadata_recommendations", function ()
    {
        it("[HTML] should refuse the request if \"application/json\" Accept header is absent", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                projectUtils.getMetadataRecomendationsForProject(false, agent, invalidProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(400);
                    should.not.exist(res.body.descriptors);
                    done();
                });
            });
        });

        it("[JSON] should forbid requests for recommendations in project " + invalidProject.handle + " if no user is authenticated.", function (done)
        {
            const app = global.tests.app;
            const agent = chai.request.agent(app);

            projectUtils.getMetadataRecomendationsForProject(true, agent, invalidProject.handle, function (err, res)
            {
                res.statusCode.should.equal(401);
                should.not.exist(res.body.descriptors);
                done();
            });
        });

        it("[JSON] should give not found for recommendations in project " + invalidProject.handle + " if user " + demouser1.username + " is authenticated.", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                projectUtils.getMetadataRecomendationsForProject(true, agent, invalidProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(404);
                    should.not.exist(res.body.descriptors);
                    done();
                });
            });
        });

        it("[JSON] should give not found for recommendations in project " + invalidProject.handle + " if user " + demouser2.username + " is authenticated.", function (done)
        {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent)
            {
                projectUtils.getMetadataRecomendationsForProject(true, agent, invalidProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(404);
                    should.not.exist(res.body.descriptors);
                    done();
                });
            });
        });

        it("[JSON] should give not found for recommendations in project " + invalidProject.handle + " if user " + demouser3.username + " is authenticated.", function (done)
        {
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent)
            {
                projectUtils.getMetadataRecomendationsForProject(true, agent, invalidProject.handle, function (err, res)
                {
                    res.statusCode.should.equal(404);
                    should.not.exist(res.body.descriptors);
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
