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
const descriptorUtils = require(Config.absPathInTestsFolder("utils/descriptor/descriptorUtils.js"));

const demouser1 = require(Config.absPathInTestsFolder("mockdata/users/demouser1.js"));
const demouser2 = require(Config.absPathInTestsFolder("mockdata/users/demouser2.js"));
const demouser3 = require(Config.absPathInTestsFolder("mockdata/users/demouser3.js"));

const publicProject = require(Config.absPathInTestsFolder("mockdata/projects/public_project.js"));

const folder = require(Config.absPathInTestsFolder("mockdata/folders/folder.js"));
var addMetadataToFoldersUnit = requireUncached(Config.absPathInTestsFolder("units/metadata/addMetadataToFolders.Unit.js"));
var db = requireUncached(Config.absPathInTestsFolder("utils/db/db.Test.js"));

function requireUncached(module) {
    delete require.cache[require.resolve(module)]
    return require(module)
}


//THIS TEST SHOULD BE DELETED BECAUSE THIS FEATURE DOES NOT EXIST
describe("Public project ?version tests", function(){
    before(function (done) {
        this.timeout(60000);
        addMetadataToFoldersUnit.setup(function (err, results) {
            should.equal(err, null);
            done();
        });
    });

    describe("[GET] /project/:handle?version", function () {
        //TODO API ONLY
        //TODO make a request to HTML, should return invalid request
        //TODO test all three types of project accesses (public, private, metadata only)

        it("Should give an error if the user is unauthenticated", function (done) {
            done(1);
        });

        it("Should give an error if the project does not exist", function (done) {
            done(1);
        });

        it("Should give an error if the user is logged in as demouser2(not a collaborator nor creator of the project)", function (done) {
            done(1);
        });

        it("Should give the resource versions if the resource exists and if the user is logged in as demouser1(the creator of the project)", function (done) {
            //jsonOnly, agent, projectHandle, cb
            userUtils.loginUser(demouser1.username, demouser1.password, function (err, agent) {
                projectUtils.getProjectVersion(true, agent, publicProject.handle, 0, function (err, res) {
                    res.statusCode.should.equal(200);
                    done();
                });
            });
        });

        it("Should give the resource versions if the resource exists and if the user is logged in as demouser3(a collaborator on the project)", function (done) {
            done(1);
        });

        it("Should give an error if the descriptors in the resource version are locked for alterations", function (done) {
            done(1);
        })
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