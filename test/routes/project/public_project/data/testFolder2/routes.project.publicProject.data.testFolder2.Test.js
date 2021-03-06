const chai = require("chai");
const chaiHttp = require("chai-http");
const should = chai.should();
const _ = require("underscore");
chai.use(chaiHttp);

const rlequire = require("rlequire");
const Config = rlequire("dendro", "src/models/meta/config.js").Config;

const userUtils = rlequire("dendro", "test/utils/user/userUtils.js");
const itemUtils = rlequire("dendro", "test/utils/item/itemUtils.js");
const repositoryUtils = rlequire("dendro", "test/utils/repository/repositoryUtils.js");
const appUtils = rlequire("dendro", "test/utils/app/appUtils.js");

const demouser1 = rlequire("dendro", "test/mockdata/users/demouser1.js");
const demouser2 = rlequire("dendro", "test/mockdata/users/demouser2.js");
const demouser3 = rlequire("dendro", "test/mockdata/users/demouser3.js");

const publicProject = rlequire("dendro", "test/mockdata/projects/public_project.js");
const invalidProject = rlequire("dendro", "test/mockdata/projects/invalidProject.js");

const testFolder2 = rlequire("dendro", "test/mockdata/folders/testFolder2.js");
const notFoundFolder = rlequire("dendro", "test/mockdata/folders/notFoundFolder.js");

const addMetadataToFoldersUnit = rlequire("dendro", "test/units/metadata/addMetadataToFolders.Unit.js");
const db = rlequire("dendro", "test/utils/db/db.Test.js");

describe("Public project testFolder2 level (default case) tests", function ()
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

    describe("/project/" + publicProject.handle + "/data/" + testFolder2.name + " (default case where the root of the folder is shown, without any query)", function ()
    {
        it("[HTML] should give the project page html [WITHOUT EDIT MODE] if the user is unauthenticated", function (done)
        {
            const app = global.tests.app;
            const agent = chai.request.agent(app);
            itemUtils.viewItem(false, agent, publicProject.handle, testFolder2.name, function (err, res)
            {
                res.should.have.status(200);
                res.text.should.contain(publicProject.handle);
                res.text.should.contain(testFolder2.name);
                res.text.should.not.contain("Edit mode");
                done();
            });
        });

        it("[HTML] should give the project page html [WITH EDIT MODE] if the user is logged in as demouser1(the project creator)", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                itemUtils.viewItem(false, agent, publicProject.handle, testFolder2.name, function (err, res)
                {
                    res.should.have.status(200);
                    res.text.should.contain(publicProject.handle);
                    res.text.should.contain(testFolder2.name);
                    res.text.should.contain("Edit mode");
                    done();
                });
            });
        });

        it("[HTML] should give the project page html [WITH EDIT MODE] if the user is logged in as demouser2(a project contributor)", function (done)
        {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent)
            {
                itemUtils.viewItem(false, agent, publicProject.handle, testFolder2.name, function (err, res)
                {
                    res.should.have.status(200);
                    res.text.should.contain(publicProject.handle);
                    res.text.should.contain(testFolder2.name);
                    res.text.should.contain("Edit mode");
                    done();
                });
            });
        });

        it("[HTML] should give the project page html [WITHOUT EDIT MODE] if the user is logged in as demouser3(non-creator or non-contributor of the project)", function (done)
        {
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent)
            {
                itemUtils.viewItem(false, agent, publicProject.handle, testFolder2.name, function (err, res)
                {
                    res.should.have.status(200);
                    res.text.should.contain(publicProject.handle);
                    res.text.should.contain(testFolder2.name);
                    res.text.should.not.contain("Edit mode");
                    done();
                });
            });
        });

        it("[JSON] should give the project root data if the user is unauthenticated", function (done)
        {
            const app = global.tests.app;
            const agent = chai.request.agent(app);
            itemUtils.viewItem(true, agent, publicProject.handle, testFolder2.name, function (err, res)
            {
                res.should.have.status(200);
                res.body.descriptors.should.be.instanceof(Array);
                res.body.title.should.equal(testFolder2.name);
                res.body.hasLogicalParts.should.be.instanceof(Array);
                res.body.file_extension.should.equal("folder");
                done();
            });
        });

        it("[JSON] should give the project root data if the user is logged in as demouser1(the project creator)", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                itemUtils.viewItem(true, agent, publicProject.handle, testFolder2.name, function (err, res)
                {
                    res.should.have.status(200);
                    res.body.descriptors.should.be.instanceof(Array);
                    res.body.title.should.equal(testFolder2.name);
                    res.body.hasLogicalParts.should.be.instanceof(Array);
                    res.body.file_extension.should.equal("folder");
                    done();
                });
            });
        });

        it("[JSON] should give the project root data if the user is logged in as demouser2(a project contributor)", function (done)
        {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent)
            {
                itemUtils.viewItem(true, agent, publicProject.handle, testFolder2.name, function (err, res)
                {
                    res.should.have.status(200);
                    res.body.descriptors.should.be.instanceof(Array);
                    res.body.title.should.equal(testFolder2.name);
                    res.body.hasLogicalParts.should.be.instanceof(Array);
                    res.body.file_extension.should.equal("folder");
                    done();
                });
            });
        });

        it("[JSON] should give the project root data if the user is logged in as demouser3(non-creator or non-contributor of the project)", function (done)
        {
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent)
            {
                itemUtils.viewItem(true, agent, publicProject.handle, testFolder2.name, function (err, res)
                {
                    res.should.have.status(200);
                    res.body.descriptors.should.be.instanceof(Array);
                    res.body.title.should.equal(testFolder2.name);
                    res.body.hasLogicalParts.should.be.instanceof(Array);
                    res.body.file_extension.should.equal("folder");
                    done();
                });
            });
        });

        it("[JSON] should give a not found error if the folder does not exist", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                itemUtils.viewItem(true, agent, publicProject.handle, notFoundFolder.name, function (err, res)
                {
                    res.should.have.status(404);
                    should.not.exist(res.body.descriptors);
                    should.not.exist(res.body.title);
                    should.not.exist(res.body.hasLogicalParts);
                    should.not.exist(res.body.file_extension);
                    done();
                });
            });
        });
    });

    describe("/project/" + invalidProject.handle + "/data/" + testFolder2.name + " NON_EXISTENT PROJECT(default case where the root of the folder is shown, without any query)", function ()
    {
        it("[HTML] should give the project page html with an error if the user is unauthenticated", function (done)
        {
            const app = global.tests.app;
            const agent = chai.request.agent(app);
            itemUtils.viewItem(false, agent, invalidProject.handle, testFolder2.name, function (err, res)
            {
                res.should.have.status(200);
                res.text.should.not.contain(invalidProject.handle);
                res.text.should.not.contain("Edit mode");
                done();
            });
        });

        it("[HTML] should give the project page html with an error if the user is logged in as demouser1(the project creator)", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                itemUtils.viewItem(false, agent, invalidProject.handle, testFolder2.name, function (err, res)
                {
                    res.should.have.status(200);
                    res.text.should.not.contain(invalidProject.handle);
                    res.text.should.not.contain("Edit mode");
                    done();
                });
            });
        });

        it("[HTML] should give the project page html with an error if the user is logged in as demouser2(a project contributor)", function (done)
        {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent)
            {
                itemUtils.viewItem(false, agent, invalidProject.handle, testFolder2.name, function (err, res)
                {
                    res.should.have.status(200);
                    res.text.should.not.contain(invalidProject.handle);
                    res.text.should.not.contain("Edit mode");
                    done();
                });
            });
        });

        it("[HTML] should give the project page html with an error if the user is logged in as demouser3(non-creator or non-contributor of the project)", function (done)
        {
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent)
            {
                itemUtils.viewItem(false, agent, invalidProject.handle, testFolder2.name, function (err, res)
                {
                    res.should.have.status(200);
                    res.text.should.not.contain(invalidProject.handle);
                    res.text.should.not.contain("Edit mode");
                    done();
                });
            });
        });

        it("[JSON] should give a 404 error if the user is unauthenticated", function (done)
        {
            const app = global.tests.app;
            const agent = chai.request.agent(app);
            itemUtils.viewItem(true, agent, invalidProject.handle, testFolder2.name, function (err, res)
            {
                res.should.have.status(404);// -> At the moment it is responding with an html page
                done();
            });
        });

        it("[JSON] should give a 404 error if the user is logged in as demouser1(the project creator)", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                itemUtils.viewItem(true, agent, invalidProject.handle, testFolder2.name, function (err, res)
                {
                    res.should.have.status(404);// -> At the moment it is responding with an html page
                    done();
                });
            });
        });

        it("[JSON] should give a 404 error if the user is logged in as demouser2(a project contributor)", function (done)
        {
            userUtils.loginUser(demouser2.username, demouser2.password, function (err, agent)
            {
                itemUtils.viewItem(true, agent, invalidProject.handle, testFolder2.name, function (err, res)
                {
                    res.should.have.status(404);// -> At the moment it is responding with an html page
                    done();
                });
            });
        });

        it("[JSON] should give a 404 error if the user is logged in as demouser3(non-creator or non-contributor of the project)", function (done)
        {
            userUtils.loginUser(demouser3.username, demouser3.password, function (err, agent)
            {
                itemUtils.viewItem(true, agent, invalidProject.handle, testFolder2.name, function (err, res)
                {
                    res.should.have.status(404);// -> At the moment it is responding with an html page
                    done();
                });
            });
        });

        it("[JSON] should give a not found error if the folder does not exist", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                itemUtils.viewItem(true, agent, invalidProject.handle, notFoundFolder.name, function (err, res)
                {
                    res.should.have.status(404);
                    should.not.exist(res.body.descriptors);
                    should.not.exist(res.body.title);
                    should.not.exist(res.body.hasLogicalParts);
                    should.not.exist(res.body.file_extension);
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
