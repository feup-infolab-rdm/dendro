const chai = require("chai");
const chaiHttp = require("chai-http");
const should = chai.should();
const _ = require("underscore");
chai.use(chaiHttp);

const Pathfinder = global.Pathfinder;
const Config = require(Pathfinder.absPathInSrcFolder("models/meta/config.js")).Config;

const userUtils = require(Pathfinder.absPathInTestsFolder("utils/user/userUtils.js"));
const fileUtils = require(Pathfinder.absPathInTestsFolder("utils/file/fileUtils.js"));
const appUtils = require(Pathfinder.absPathInTestsFolder("utils/app/appUtils.js"));
const descriptorUtils = require(Pathfinder.absPathInTestsFolder("utils/descriptor/descriptorUtils.js"));

const demouser1 = require(Pathfinder.absPathInTestsFolder("mockdata/users/demouser1.js"));
const demouser2 = require(Pathfinder.absPathInTestsFolder("mockdata/users/demouser2.js"));
const demouser3 = require(Pathfinder.absPathInTestsFolder("mockdata/users/demouser3.js"));

const privateProject = require(Pathfinder.absPathInTestsFolder("mockdata/projects/private_project.js"));
const invalidProject = require(Pathfinder.absPathInTestsFolder("mockdata/projects/invalidProject.js"));

const testFolder1 = require(Pathfinder.absPathInTestsFolder("mockdata/folders/testFolder1.js"));
const notFoundFolder = require(Pathfinder.absPathInTestsFolder("mockdata/folders/notFoundFolder.js"));
const folderForDemouser2 = require(Pathfinder.absPathInTestsFolder("mockdata/folders/folderDemoUser2"));
const createFoldersUnit = appUtils.requireUncached(Pathfinder.absPathInTestsFolder("units/folders/createFolders.Unit.js"));
const db = appUtils.requireUncached(Pathfinder.absPathInTestsFolder("utils/db/db.Test.js"));

const zipFile = require(Pathfinder.absPathInTestsFolder("mockdata/files/zipMockFile.js"));

describe("Upload files into testFolder1 of Private project", function () {
    before(function (done) {
        this.timeout(Config.testsTimeout);
        createFoldersUnit.setup(function (err, results) {
            should.equal(err, null);
            done();
        });
    });

    describe("[POST] [PRIVATE PROJECT] [Invalid Cases] /project/" + privateProject.handle + "/data/:foldername?upload", function() {
        //API ONLY
        it("Should give an error if the request type for this route is HTML", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                fileUtils.uploadFile(false, agent, privateProject.handle, testFolder1.name, zipFile, function (err, res) {
                    res.statusCode.should.equal(400);
                    done();
                });
            });
        });

        it("Should give an error message when a project does not exist", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                fileUtils.uploadFile(true, agent, invalidProject.handle, testFolder1.name, zipFile, function (err, res) {
                    res.statusCode.should.equal(404);
                    fileUtils.downloadFile(true, agent, invalidProject.handle, testFolder1.name, zipFile, function (error, response) {
                        response.statusCode.should.equal(404);
                        done();
                    });
                });
            });
        });

        it("Should give an error message when the folder does not exist", function (done) {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                fileUtils.uploadFile(true, agent, invalidProject.handle, testFolder1.name, zipFile, function (err, res) {
                    res.statusCode.should.equal(404);
                    fileUtils.downloadFile(true, agent, invalidProject.handle, testFolder1.name, zipFile, function (error, response) {
                        response.statusCode.should.equal(404);
                        done();
                    });
                });
            });
        });

        it("Should give an error when the user is not authenticated", function (done) {
            const app = global.tests.app;
            const agent = chai.request.agent(app);

            fileUtils.uploadFile(true, agent, privateProject.handle, testFolder1.name, zipFile, function (err, res) {
                res.statusCode.should.equal(401);
                fileUtils.downloadFile(true, agent, privateProject.handle, testFolder1.name, zipFile, function (error, response) {
                    response.statusCode.should.equal(404);
                    done();
                });
            });
        });
    });

    describe("[POST] [PRIVATE PROJECT] /project/" + privateProject.handle + "/data/:foldername?upload", function() {
        it("Should upload a ZIP file successfully", function (done) {
            const app = global.tests.app;
            const agent = chai.request.agent(app);

            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                fileUtils.uploadFile(true, agent, privateProject.handle, testFolder1.name, zipFile, function (err, res)
                {
                    res.statusCode.should.equal(200);
                    res.body.should.be.instanceof(Array);
                    res.body.length.should.equal(1);

                    fileUtils.downloadFileByUri(true, agent, res.body[0].uri, function (error, res)
                    {
                        res.statusCode.should.equal(200);
                        done();
                    });
                });
            });
        });
    });

    after(function (done) {
        //destroy graphs
        this.timeout(Config.testsTimeout);
        appUtils.clearAppState(function (err, data) {
            should.equal(err, null);
            done();
        });
    });
});