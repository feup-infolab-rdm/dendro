process.env.NODE_ENV = "test";

const chai = require("chai");
const chaiHttp = require("chai-http");
chai.use(chaiHttp);

const Config = global.Config;

const should = chai.should();
const async = require("async");
const appUtils = require(Pathfinder.absPathInTestsFolder("utils/app/appUtils.js"));

const administerUtils = require(Pathfinder.absPathInTestsFolder("utils/administer/administerUtils.js"));
const userUtils = require(Pathfinder.absPathInTestsFolder("utils/user/userUtils.js"));
const itemUtils = require(Pathfinder.absPathInTestsFolder("/utils/item/itemUtils"));
const fileUtils = require(Pathfinder.absPathInTestsFolder("utils/file/fileUtils.js"));

const demouser1 = require(Pathfinder.absPathInTestsFolder("mockdata/users/demouser1"));
const admin = require(Pathfinder.absPathInTestsFolder("mockdata/users/admin"));
const isNull = require(Pathfinder.absPathInSrcFolder("/utils/null.js")).isNull;

const publicProject = require(Pathfinder.absPathInTestsFolder("mockdata/projects/public_project.js"));
const zipMockFile = require(Pathfinder.absPathInTestsFolder("mockdata/files/zipMockFile.js"));
const txtMockFile = require(Pathfinder.absPathInTestsFolder("mockdata/files/txtMockFile.js"));
const odsMockFile = require(Pathfinder.absPathInTestsFolder("mockdata/files/odsMockFile.js"));
let txtMockFileUri;
let zipMockFileUri;
let odsMockFileUri;

let app;
let agent;

checkFileExistsInGridFs = function (fileUri, callback)
{
    const DendroMongoClient = require(Pathfinder.absPathInSrcFolder("/kb/mongo.js")).DendroMongoClient;
    let mongoClient = new DendroMongoClient(Config.mongoDBHost, Config.mongoDbPort, Config.mongoDbCollectionName);
    mongoClient.connect(function (err, mongoDb)
    {
        if (isNull(err) && !isNull(mongoDb))
        {
            mongoClient.findFileByFilenameOrderedByDate(mongoDb, fileUri, function (err, files)
            {
                callback(err, files);
            });
        }
        else
        {
            const msg = "Error when connencting to mongodb, error: " + JSON.stringify(err);
            Logger.log("error", msg);
            return callback(err, msg);
        }
    });
};

describe("Administration list orphan resources tests ( /admin/list_orphan_resources )", function (done)
{
    this.timeout(Config.testsTimeout);
    before(function (done)
    {
        const CreateFoldersPublicProject = require(Pathfinder.absPathInTestsFolder("units/folders/createFoldersPublicProject.Unit.js"));
        const AddMetadataToFoldersInPublicProjectUnit = require(Pathfinder.absPathInTestsFolder("units/metadata/addMetadataToFoldersPublicProject.Unit.js"));
        const foldersData = CreateFoldersPublicProject.foldersData;

        AddMetadataToFoldersInPublicProjectUnit.setup(function (err, res)
        {
            should.equal(err, null);
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                should.equal(err, null);
                fileUtils.uploadFile(true, agent, publicProject.handle, foldersData[0].name, txtMockFile, function (err, res)
                {
                    should.equal(err, null);
                    txtMockFileUri = res.body[0].uri;
                    fileUtils.uploadFile(true, agent, publicProject.handle, foldersData[0].name, zipMockFile, function (err, res)
                    {
                        should.equal(err, null);
                        zipMockFileUri = res.body[0].uri;
                        fileUtils.uploadFile(true, agent, publicProject.handle, foldersData[0].name, odsMockFile, function (err, res)
                        {
                            should.equal(err, null);
                            odsMockFileUri = res.body[0].uri;
                            done();
                        });
                    });
                });
            });
        });
    });
    describe("Invalid cases", function ()
    {
        it("Should not allow listing orphan resources without being logged in", function (done)
        {
            app = global.tests.app;
            agent = chai.request.agent(app);
            administerUtils.listOrphanResources(agent,
                function (err, res)
                {
                    res.should.have.status(401);
                    res.body.message.should.equal("Error detected. You are not authorized to perform this operation. You must be a Dendro administrator.");
                    done();
                });
        });

        it("Should not allow listing orphan resources without being logged in as an administrator", function (done)
        {
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent)
            {
                administerUtils.listOrphanResources(agent,
                    function (err, res)
                    {
                        res.should.have.status(401);
                        res.body.message.should.equal("Error detected. You are not authorized to perform this operation. You must be a Dendro administrator.");
                        done();
                    });
            });
        });
    });

    describe("Valid cases", function ()
    {
        it("[CASE: NO ORPHAN RESOURCES] Should allow listing orphan resources if the user is an administrator", function (done)
        {
            userUtils.loginUser(admin.username, admin.password, function (err, agent)
            {
                administerUtils.listOrphanResources(
                    agent,
                    function (err, res)
                    {
                        res.should.have.status(200);
                        res.body.message.should.equal("There are 0 orphan resources in gridfs!");
                        res.body.orphanResources.should.be.instanceof(Array);
                        res.body.orphanResources.length.should.equal(0);
                        done();
                    });
            });
        });

        it("[CASE: 1  TWO ORPHAN RESOURCES FOUND] Should allow allow listing orphan resources if the user is an administrator", function (done)
        {
            userUtils.loginUser(admin.username, admin.password, function (err, agent)
            {
                const Pathfinder = global.Pathfinder;
                const Resource = require(Pathfinder.absPathInSrcFolder("/models/resource.js")).Resource;
                async.mapSeries([txtMockFileUri, zipMockFileUri], function (fileUri, cb)
                {
                    Resource.findByUri(fileUri, function (err, resource)
                    {
                        should.equal(err, null);
                        should.not.equal(resource, null);
                        resource.deleteAllMyTriples(function (err, result)
                        {
                            should.equal(err, null);
                            cb(err, result);
                        });
                    });
                }, function (err, result)
                {
                    should.equal(err, null);
                    administerUtils.listOrphanResources(
                        agent,
                        function (err, res)
                        {
                            res.should.have.status(200);
                            res.body.message.should.equal("There are 2 orphan resources in gridfs!");
                            res.body.orphanResources.should.be.instanceof(Array);
                            res.body.orphanResources.length.should.equal(2);
                            res.body.orphanResources.should.contain(txtMockFileUri);
                            res.body.orphanResources.should.contain(zipMockFileUri);
                            res.body.orphanResources.should.not.contain(odsMockFileUri);
                            fileUtils.downloadFileByUri(true, agent, txtMockFileUri, function (error, res)
                            {
                                // The txt file is still orphan
                                res.statusCode.should.equal(404);
                                fileUtils.downloadFileByUri(true, agent, zipMockFileUri, function (error, res)
                                {
                                    // The zip file is still orphan
                                    res.statusCode.should.equal(404);
                                    fileUtils.downloadFileByUri(true, agent, odsMockFileUri, function (error, res)
                                    {
                                        // The ods file is not an orphan
                                        res.statusCode.should.equal(200);
                                        checkFileExistsInGridFs(txtMockFileUri, function (err, files)
                                        {
                                            should.equal(err, null);
                                            // The txt file is orphan but was not deleted in gridfs-> because this is only the list endpoint
                                            files.length.should.equal(1);
                                            checkFileExistsInGridFs(zipMockFileUri, function (err, files)
                                            {
                                                should.equal(err, null);
                                                // The zip file is orphan but was not deleted gridfs -> because this is only the list endpoint
                                                files.length.should.equal(1);
                                                checkFileExistsInGridFs(odsMockFileUri, function (err, files)
                                                {
                                                    should.equal(err, null);
                                                    // The ods file is not an orphan
                                                    files.length.should.equal(1);
                                                    done();
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                });
            });
        });
    });
});
