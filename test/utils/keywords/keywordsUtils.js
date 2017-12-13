const chai = require("chai");
const chaiHttp = require("chai-http");
const _ = require("underscore");
chai.use(chaiHttp);

module.exports.loadfiles = function (text, agent, cb)
{
    const path = "/keywords/loadfiles";
    agent
        .get(path)
        .send({text: text})
        .then(function (response, res)
        {
            if (response.ok)
            {
                cb(null, response);
            }
            else
            {
                cb("Error processing files.", response);
            }
        });
};

module.exports.preprocessing = function (text, agent, cb)
{
    const path = "/keywords/preprocessing";
    agent
        .get(path)
        .send({text: text})
        .then(function (response, res)
        {
            if (response.ok)
            {
                cb(null, response);
            }
            else
            {
                cb("Error processing text.", response);
            }
        });
};

module.exports.termextraction = function (text, documents, agent, cb)
{
    console.log(text);
    const path = "/keywords/termextraction";
    agent
        .post(path)
        .attach("text", new Buffer.from(JSON.stringify({text: text, documents: documents})))
        .set("Accept", "application/json")
        .then(function (response, res)
        {
            if (response.ok)
            {
                cb(null, response);
            }
            else
            {
                cb("Error extracting terms.", response);
            }
        });
};

module.exports.dbpedialookup = function (text, agent, cb)
{
    const path = "/keywords/dbpedialookup";
    agent
        .get(path)
        .send({keywords: text})
        .then(function (response, res)
        {
            if (response.ok)
            {
                cb(null, response);
            }
            else
            {
                cb("Error dbpedia lookup.", response);
            }
        });
};

