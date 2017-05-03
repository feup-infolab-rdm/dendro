process.env.NODE_ENV = 'test';

var chai = require('chai');
var chaiHttp = require('chai-http');
const should = chai.should();
var _ = require('underscore');
chai.use(chaiHttp);

const Config = GLOBAL.Config;

const projectUtils = require(Config.absPathInTestsFolder("utils/project/projectUtils.js"));
const userUtils = require(Config.absPathInTestsFolder("utils/user/userUtils.js"));
const folderUtils = require(Config.absPathInTestsFolder("utils/folder/folderUtils.js"));
const httpUtils = require(Config.absPathInTestsFolder("utils/http/httpUtils.js"));
const repositoryUtils = require(Config.absPathInTestsFolder("utils/repository/repositoryUtils.js"));

const demouser1 = require(Config.absPathInTestsFolder("mockdata/users/demouser1.js"));
const demouser2 = require(Config.absPathInTestsFolder("mockdata/users/demouser2.js"));
const demouser3 = require(Config.absPathInTestsFolder("mockdata/users/demouser3.js"));

const publicProject = require(Config.absPathInTestsFolder("mockdata/projects/public_project.js"));
const folder = require(Config.absPathInTestsFolder("mockdata/folders/folder.js"));

var createExportToRepositoriesConfig = requireUncached(Config.absPathInTestsFolder("units/repositories/createExportToRepositoriesConfigs.Unit.js"));
var db = requireUncached(Config.absPathInTestsFolder("utils/db/db.Test.js"));

let b2shareData, ckanData, zenodoData, dspaceData, eprintsData,figshareData;

function requireUncached(module) {
    delete require.cache[require.resolve(module)]
    return require(module)
}

describe("Export public project to repositories tests", function () {
    before(function (done) {
        this.timeout(60000);
        createExportToRepositoriesConfig.setup(function (err, results) {
            should.equal(err, null);
            repositoryUtils.getMyExternalRepositories(true, agent, function (err, res) {
                res.statusCode.should.equal(200);
                res.body.length.should.equal(5);//TODO change this after dspace is working to 6
                b2shareData = _.find(res.body, function (externalRepo) {return externalRepo.ddr.hasPlatform.foaf.nick == "b2share"});
                ckanData = _.find(res.body, function (externalRepo) {return externalRepo.ddr.hasPlatform.foaf.nick == "ckan"});
                zenodoData = _.find(res.body, function (externalRepo) {return externalRepo.ddr.hasPlatform.foaf.nick == "zenodo"});
                //TODO add the line bellow when dspace is working
                //dspaceData = _.find(res.body, function (externalRepo) {return externalRepo.ddr.hasPlatform.foaf.nick == "dspace"});
                eprintsData = _.find(res.body, function (externalRepo) {return externalRepo.ddr.hasPlatform.foaf.nick == "eprints"});
                figshareData = _.find(res.body, function (externalRepo) {return externalRepo.ddr.hasPlatform.foaf.nick == "figshare"});
                done();
            });
        });
    });

    describe("[POST] [B2SHARE] /project/:handle?export_to_repository", function () {
        //TODO API ONLY
        //TODO make a request to HTML, should return invalid request

        it("Should give an error when the target repository is invalid[not b2share zenodo etc]", function (done) {
            done(1);
            //TODO this is not implemented i think
        });

        it("Should give an error when the user is unauthenticated", function (done) {
            done(1);
            //TODO this is not implemented i think
        });

        it("Should give an error when the user is logged in as demouser2(nor creator nor collaborator of the project)", function (done) {
            done(1);
            //TODO this is not implemented i think
        });

        it("Should give an error when there is an invalid access token for deposit although a creator or collaborator is logged in", function (done) {
            done(1);
            //TODO this is not implemented i think
        });

        it("Should give an error when there is an invalid external url for deposit although a creator or collaborator is logged in", function (done) {
            done(1);
            //TODO this is not implemented i think
        });

        it("Should give an error when the project to export does not exist although a creator or collaborator is logged in", function (done) {
            done(1);
            //TODO this is not implemented i think
        });

        it("Should give a success message when the project to export exists and a creator or collaborator is logged in", function (done) {
            //TODO this is not implemented i think
            /*
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                repositoryUtils.exportToRepository(true, publicProject.handle, agent, {repository: b2shareData}, function (err, res) {
                    res.statusCode.should.equal(200);
                    done();
                });
            });*/
            done(1);
        });
    });

    after(function (done) {
        //destroy graphs
        this.timeout(60000);
        db.deleteGraphs(function (err, data) {
            should.equal(err, null);
            GLOBAL.tests.server.close();
            done();
        });
    });
});
