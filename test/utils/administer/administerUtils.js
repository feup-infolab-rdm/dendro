const chai = require("chai");
const chaiHttp = require("chai-http");
chai.use(chaiHttp);

exports.getAdministerPage = function (agent, jsonOnly, cb)
{
    if (jsonOnly)
    {
        agent
            .get("/admin")
            .set("Accept", "application/json")
            .end(function (err, res)
            {
                cb(err, res);
            });
    }
    else
    {
        agent
            .get("/admin")
            .end(function (err, res)
            {
                cb(err, res);
            });
    }
};

exports.reindexGraphs = function (agent, graphs, cb)
{
    agent
        .post("/admin/reindex")
        .send(graphs)
        .end(function (err, res)
        {
            cb(err, res);
        });
};

module.exports = exports;
