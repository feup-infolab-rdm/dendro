const humanize = require("humanize");
const Pathfinder = global.Pathfinder;
const path = require("path");
const Config = require(Pathfinder.absPathInSrcFolder("models/meta/config.js")).Config;

const isNull = require(Pathfinder.absPathInSrcFolder("/utils/null.js")).isNull;
const Project = require(Pathfinder.absPathInSrcFolder("/models/project.js")).Project;
const InformationElement = require(Pathfinder.absPathInSrcFolder("/models/directory_structure/information_element.js")).InformationElement;
const Folder = require(Pathfinder.absPathInSrcFolder("/models/directory_structure/folder.js")).Folder;
const File = require(Pathfinder.absPathInSrcFolder("/models/directory_structure/file.js")).File;
const Descriptor = require(Pathfinder.absPathInSrcFolder("/models/meta/descriptor.js")).Descriptor;
const User = require(Pathfinder.absPathInSrcFolder("/models/user.js")).User;
const FileSystemPost = require(Pathfinder.absPathInSrcFolder("/models/social/fileSystemPost.js")).FileSystemPost;
const Uploader = require(Pathfinder.absPathInSrcFolder("/utils/uploader.js")).Uploader;
const Elements = require(Pathfinder.absPathInSrcFolder("/models/meta/elements.js")).Elements;
const Event = require(Pathfinder.absPathInSrcFolder("/models/event.js")).Event;
const Logger = require(Pathfinder.absPathInSrcFolder("utils/logger.js")).Logger;
const contentDisposition = require("content-disposition");

const async = require("async");

const db_social = (function ()
{
    return Config.db.social;
}());

exports.download = function (req, res)
{
    const self = this;

    let requestedResourceURI = req.params.requestedResourceUri;

    const downloadFolder = function (requestedResourceURI, res)
    {
        Folder.findByUri(requestedResourceURI, function (err, folderToDownload)
        {
            if (isNull(err))
            {
                const mimeType = Config.mimeType("zip");
                const fileName = folderToDownload.nie.title + ".zip";

                res.writeHead(200,
                    {
                        "Content-Disposition": contentDisposition(fileName),
                        "Content-Type": mimeType
                    }
                );

                const includeMetadata = (!isNull(req.query.backup));
                const bagIt = (!isNull(req.query.bagit));

                const async = require("async");

                async.series([
                    function (cb)
                    {
                        if (bagIt)
                        {
                            const bagitOptions = {
                                cryptoMethod: "sha256"
                            };

                            folderToDownload.bagit(bagitOptions, function (err, result, absolutePathOfFinishedFolder, parentFolderPath)
                            {
                                const path = require("path");

                                const finishedZipFileName = "bagit_backup.zip";
                                const finishedZipFileAbsPath = path.join(parentFolderPath, finishedZipFileName);

                                Folder.zip(absolutePathOfFinishedFolder, finishedZipFileAbsPath, function (err, zipFileFullPath)
                                {
                                    cb(err, zipFileFullPath);
                                }, finishedZipFileName, true);
                            });
                        }
                        else
                        {
                            folderToDownload.zipAndDownload(includeMetadata, function (err, writtenFilePath)
                            {
                                cb(err, writtenFilePath);
                            });
                        }
                    }
                ],
                function (err, results)
                {
                    if (isNull(err))
                    {
                        if (!isNull(results) && !isNull(results[0]))
                        {
                            var writtenFilePath = results[0];

                            const fs = require("fs");
                            const fileStream = fs.createReadStream(writtenFilePath);
                            const parentPath = path.resolve(writtenFilePath, "..");

                            res.on("finish", function ()
                            {
                                if (!isNull(parentPath))
                                {
                                    File.deleteOnLocalFileSystem(parentPath, function (err, stdout, stderr)
                                    {
                                        if (err)
                                        {
                                            Logger.log("error", "Unable to delete " + parentPath);
                                        }
                                        else
                                        {
                                            Logger.log("Deleted " + parentPath);
                                        }
                                    });
                                }
                                else
                                {
                                    Logger.log("error", "Could not calculate parent path of: " + writtenFilePath);
                                }
                            });

                            fileStream.pipe(res);
                        }
                        else
                        {
                            const error = "There was an error attempting to fetch the requested resource : " + requestedResourceURI;
                            Logger.log("error", error);
                            res.status(500).write("Error : " + error + "\n");
                            res.end();
                        }
                    }
                    else
                    {
                        if (err === 404)
                        {
                            const error = "There was already a prior attempt to delete this folder. The folder is now deleted but still appears in the file explorer due to a past error. Try deleting it again to fix the issue. " + requestedResourceURI;
                            Logger.log("error", error);
                            res.writeHead(404, error);
                            res.end();
                        }
                        else
                        {
                            Logger.log("error", "Unable to produce temporary file to download " + self.uri + " Error returned : " + JSON.stringify(results));
                        }
                    }
                });
            }
            else
            {
                const error = "Non-existent folder. Is this a file instead of a folder? : " + requestedResourceURI;
                Logger.log("error", error);
                res.writeHead(404, error);
                res.end();
            }
        });
    };
    const downloadFile = function (requestedResourceURI, res)
    {
        File.findByUri(requestedResourceURI, function (err, file)
        {
            if (isNull(err))
            {
                const mimeType = Config.mimeType(file.ddr.fileExtension);
                file.writeToTempFile(function (err, writtenFilePath)
                {
                    if (isNull(err))
                    {
                        if (!isNull(writtenFilePath))
                        {
                            const fs = require("fs");
                            const fileStream = fs.createReadStream(writtenFilePath);
                            const parentPath = path.resolve(writtenFilePath, "..");
                            res.writeHead(200,
                                {
                                    "Content-Disposition": contentDisposition(file.nie.title),
                                    "Content-type": mimeType
                                });

                            res.on("finish", function ()
                            {
                                if (!isNull(parentPath))
                                {
                                    Folder.deleteOnLocalFileSystem(parentPath, function (err, stdout, stderr)
                                    {
                                        if (err)
                                        {
                                            Logger.log("error", "Unable to delete " + parentPath);
                                        }
                                        else
                                        {
                                            Logger.log("Deleted " + parentPath);
                                        }
                                    });
                                }
                                else
                                {
                                    Logger.log("error", "Could not calculate parent path of: " + writtenFilePath);
                                }
                            });

                            fileStream.pipe(res);
                        }
                        else
                        {
                            const error = "There was an error streaming the requested resource : " + requestedResourceURI;
                            Logger.log("error", error);
                            res.writeHead(500, error);
                            res.end();
                        }
                    }
                    else
                    {
                        if (err === 404)
                        {
                            const error = "There was already a prior attempt to delete this file. The file is now deleted but still appears in the file explorer due to a past error. Try deleting it again to fix the issue. " + requestedResourceURI;
                            Logger.log("error", error);
                            res.writeHead(404, error);
                            res.end();
                        }
                        else
                        {
                            const error = "Unable to produce temporary file to download " + requestedResourceURI + ". Error reported :" + writtenFilePath;
                            Logger.log("error", error);
                            res.writeHead(500, error);
                            res.end();
                        }
                    }
                });
            }
            else
            {
                const error = "Non-existent file : " + requestedResourceURI;
                Logger.log("error", error);
                res.writeHead(404, error);
                res.end();
            }
        });
    };

    // we are fetching the root folder of a project
    if (req.params.is_project_root)
    {
        Project.findByUri(requestedResourceURI, function (err, project)
        {
            if (isNull(err))
            {
                if (!isNull(project))
                {
                    project.getRootFolder(function (err, rootFolder)
                    {
                        if (isNull(err))
                        {
                            if (!(isNull(rootFolder)) && rootFolder instanceof Folder)
                            {
                                downloadFolder(rootFolder.uri, res);
                            }
                            else
                            {
                                const error = "Unable to determine the root folder of project : " + requestedResourceURI;
                                Logger.log("error", error);
                                res.status(500).write("Error : " + error + "\n");
                                res.end();
                            }
                        }
                    });
                }
                else
                {
                    const error = "Non-existent project : " + requestedResourceURI;
                    Logger.log("error", error);
                    res.status(404).write("Error : " + error + "\n");
                    res.end();
                }
            }
            else
            {
                const error = "Error occurred while retrieving project : " + requestedResourceURI;
                Logger.log("error", error);
                res.status(500).write("Error : " + error + "\n");
                res.end();
            }
        });
    }
    else
    {
        InformationElement.findByUri(requestedResourceURI, function (err, ie)
        {
            if (isNull(err))
            {
                if (!isNull(ie))
                {
                    const path = require("path");
                    if (ie.isA(File))
                    {
                        downloadFile(requestedResourceURI, res);
                    }
                    else if (ie.isA(Folder))
                    {
                        downloadFolder(requestedResourceURI, res);
                    }
                    else
                    {
                        const error = "Unable to determine the type of the requested resource : " + requestedResourceURI;
                        Logger.log("error", error);
                        res.status(500).write("Error : " + error + "\n");
                        res.end();
                    }
                }
                else
                {
                    const error = "Unable to determine the type of the requested resource, error 2 : " + requestedResourceURI + ie;
                    Logger.log("error", error);
                    res.status(404).write("error");
                    res.end();
                }
            }
            else
            {
                const error = "Unable to determine the type of the requested resource, error 2 : " + requestedResourceURI + ie;
                Logger.log("error", error);
                res.status(500).write("Error : " + error + "\n");
                res.end();
            }
        });
    }
};
/*
Used to serve some files in html like images, text files...
 */
exports.serve = function (req, res)
{
    const self = this;
    const requestedResourceURI = req.params.requestedResourceUri;

    const downloadFolder = function (requestedResourceURI, res)
    {
        Folder.findByUri(requestedResourceURI, function (err, folderToDownload)
        {
            if (isNull(err))
            {
                if (!isNull(folderToDownload) && folderToDownload instanceof Folder)
                {
                    const includeMetadata = (!isNull(req.query.backup));

                    folderToDownload.zipAndDownload(includeMetadata, function (err, writtenFilePath)
                    {
                        if (isNull(err))
                        {
                            if (!isNull(writtenFilePath))
                            {
                                const fs = require("fs");
                                const fileStream = fs.createReadStream(writtenFilePath);

                                const mimeType = Config.mimeType("zip");
                                const fileName = folderToDownload.nie.title + ".zip";
                                const parentPath = path.resolve(writtenFilePath, "..");

                                res.writeHead(200,
                                    {
                                        "Content-Disposition": contentDisposition(fileName),
                                        "Content-Type": mimeType
                                    }
                                );

                                res.on("finish", function ()
                                {
                                    if (!isNull(parentPath))
                                    {
                                        Folder.deleteOnLocalFileSystem(parentPath, function (err, stdout, stderr)
                                        {
                                            if (err)
                                            {
                                                Logger.log("error", "Unable to delete " + parentPath);
                                            }
                                            else
                                            {
                                                Logger.log("Deleted " + parentPath);
                                            }
                                        });
                                    }
                                    else
                                    {
                                        Logger.log("error", "Could not calculate parent path of: " + writtenFilePath);
                                    }
                                });

                                fileStream.pipe(res);
                            }
                            else
                            {
                                const error = "There was an error attempting to fetch the requested resource : " + requestedResourceURI;
                                Logger.log("error", error);
                                res.status(500).write("Error : " + error + "\n");
                                res.end();
                            }
                        }
                        else
                        {
                            if (err === 404)
                            {
                                const error = "There was already a prior attempt to delete this folder. The folder is now deleted but still appears in the file explorer due to a past error. Try deleting it again to fix the issue. " + requestedResourceURI;
                                Logger.log("error", error);
                                res.status(404).json({
                                    result: "error",
                                    message: error
                                });
                            }
                            else
                            {
                                const error = "Unable to produce temporary file to download " + self.uri + " Error returned : " + writtenFilePath;
                                Logger.log("error", error);
                                res.status(500).json({
                                    result: "error",
                                    message: error
                                });
                            }
                        }
                    });
                }
                else
                {
                    const error = "Non-existent folder. Is this a file instead of a folder? : " + requestedResourceURI;
                    Logger.log("error", error);
                    res.status(404).json({
                        result: "error",
                        message: error
                    });
                }
            }
            else
            {
                const error = "Error fetching folder" + requestedResourceURI;
                Logger.log("error", error);
                res.status(500).json({
                    result: "error",
                    message: error
                });
            }
        });
    };

    // we are fetching the root folder of a project
    if (req.params.is_project_root)
    {
        downloadFolder(requestedResourceURI, res);
    }
    else
    {
        InformationElement.findByUri(requestedResourceURI,
            function (err, ie)
            {
                if (isNull(err))
                {
                    const path = require("path");
                    if (ie.isA(File))
                    {
                        File.findByUri(requestedResourceURI, function (err, file)
                        {
                            if (isNull(err))
                            {
                                const mimeType = Config.mimeType(file.ddr.fileExtension);

                                file.writeToTempFile(function (err, writtenFilePath)
                                {
                                    if (isNull(err))
                                    {
                                        if (!isNull(writtenFilePath))
                                        {
                                            const fs = require("fs");
                                            const fileStream = fs.createReadStream(writtenFilePath);

                                            res.writeHead(200,
                                                {
                                                    "Content-Disposition": contentDisposition(file.nie.title),
                                                    "Content-type": mimeType
                                                });

                                            res.on("finish", function ()
                                            {
                                                const path = require("path");
                                                const parentFolderPath = path.resolve(writtenFilePath, "..");

                                                Folder.deleteOnLocalFileSystem(parentFolderPath, function (err, stdout, stderr)
                                                {
                                                    if (err)
                                                    {
                                                        Logger.log("error", "Unable to delete " + parentFolderPath);
                                                    }
                                                    else
                                                    {
                                                        Logger.log("Deleted " + parentFolderPath);
                                                    }
                                                });
                                            });

                                            fileStream.pipe(res);
                                        }
                                        else
                                        {
                                            const error = "There was an error streaming the requested resource : " + requestedResourceURI;
                                            Logger.log("error", error);
                                            res.writeHead(500, error);
                                            res.end();
                                        }
                                    }
                                    else
                                    {
                                        if (err === 404)
                                        {
                                            const error = "There was already a prior attempt to delete this file. The file is now deleted but still appears in the file explorer due to a past error. Try deleting it again to fix the issue. " + requestedResourceURI;
                                            Logger.log("error", error);
                                            res.writeHead(404, error);
                                            res.end();
                                        }
                                        else
                                        {
                                            const error = "Unable to produce temporary file to download " + requestedResourceURI + ". Error reported :" + writtenFilePath;
                                            Logger.log("error", error);
                                            res.writeHead(500, error);
                                            res.end();
                                        }
                                    }
                                });
                            }
                            else
                            {
                                const error = "Non-existent file : " + requestedResourceURI;
                                Logger.log("error", error);
                                res.writeHead(404, error);
                                res.end();
                            }
                        });
                    }
                    else if (ie.isA(Folder))
                    {
                        downloadFolder(requestedResourceURI, res);
                    }
                    else
                    {
                        const error = "Unable to determine the type of the requested resource : " + requestedResourceURI;
                        Logger.log("error", error);
                        res.status(500).write("Error : " + error + "\n");
                        res.end();
                    }
                }
                else
                {
                    const error = "Unable to determine the type of the requested resource, error 2 : " + requestedResourceURI + ie;
                    Logger.log("error", error);
                    res.status(500).write("Error : " + error + "\n");
                    res.end();
                }
            });
    }
};
exports.serve_base64 = function (req, res)
{
    const requestedResourceURI = req.params.requestedResourceUri;

    InformationElement.findByUri(requestedResourceURI, function (err, ie)
    {
        if (isNull(err))
        {
            if (!isNull(ie))
            {
                if (ie.isA(File))
                {
                    File.findByUri(requestedResourceURI, function (err, file)
                    {
                        if (isNull(err))
                        {
                            const mimeType = Config.mimeType(file.ddr.fileExtension);

                            file.writeToTempFile(function (err, writtenFilePath)
                            {
                                if (isNull(err))
                                {
                                    if (!isNull(writtenFilePath))
                                    {
                                        const fs = require("fs");
                                        const fileStream = fs.createReadStream(writtenFilePath);

                                        res.on("end", function ()
                                        {
                                            Logger.log("close");
                                            File.deleteOnLocalFileSystem(writtenFilePath, function (err, stdout, stderr)
                                            {
                                                if (!isNull(err))
                                                {
                                                    Logger.log("error", err);
                                                    Logger.log("error", stdout);
                                                    Logger.log("error", stderr);
                                                }
                                            });
                                        });
                                        const base64 = require("base64-stream");

                                        res.on("end", function ()
                                        {
                                            Folder.deleteOnLocalFileSystem(writtenFilePath, function (err, stdout, stderr)
                                            {
                                                if (err)
                                                {
                                                    Logger.log("error", "Unable to delete " + writtenFilePath);
                                                }
                                                else
                                                {
                                                    Logger.log("Deleted " + writtenFilePath);
                                                }
                                            });
                                        });

                                        fileStream.pipe(base64.encode()).pipe(res);
                                    }
                                    else
                                    {
                                        const error = "There was an error streaming the requested resource : " + requestedResourceURI;
                                        Logger.log("error", error);
                                        res.writeHead(500, error);
                                        res.end();
                                    }
                                }
                                else
                                {
                                    if (err === 404)
                                    {
                                        const error = "There was already a prior attempt to delete this file. The file is now deleted but still appears in the file explorer due to a past error. Try deleting it again to fix the issue. " + requestedResourceURI;
                                        Logger.log("error", error);
                                        res.writeHead(404, error);
                                        res.end();
                                    }
                                    else
                                    {
                                        const error = "Unable to produce temporary file to download " + requestedResourceURI + ". Error reported :" + writtenFilePath;
                                        Logger.log("error", error);
                                        res.writeHead(500, error);
                                        res.end();
                                    }
                                }
                            });
                        }
                        else
                        {
                            const error = "Non-existent file : " + requestedResourceURI;
                            Logger.log("error", error);
                            res.writeHead(404, error);
                            res.end();
                        }
                    });
                }
                else if (ie.isA(Folder))
                {
                    const error = "Resource : " + requestedResourceURI + " is a folder and cannot be represented in Base64";
                    Logger.log("error", error);
                    res.status(500).write("Error : " + error + "\n");
                    res.end();
                }
                else
                {
                    const error = "Unable to determine the type of the requested resource : " + requestedResourceURI;
                    Logger.log("error", error);
                    res.status(500).write("Error : " + error + "\n");
                    res.end();
                }
            }
            else
            {
                const error = "Unable to determine the type of the requested resource, error 2 : " + requestedResourceURI + ie;
                Logger.log("error", error);
                res.status(404).write("error");
                res.end();
            }
        }
        else
        {
            const error = "Unable to determine the type of the requested resource, error 2 : " + requestedResourceURI + ie;
            Logger.log("error", error);
            res.status(500).write("Error : " + error + "\n");
            res.end();
        }
    });
};

exports.get_thumbnail = function (req, res)
{
    const requestedResourceURI = req.params.requestedResourceUri;
    const size = req.query.size;

    InformationElement.findByUri(requestedResourceURI, function (err, ie)
    {
        if (isNull(err))
        {
            if (!isNull(ie))
            {
                if (ie.isA(Folder))
                {
                    exports.serve_static(req, res, "/images/icons/folder.png", "/images/icons/folder.png", Config.cache.static.last_modified_caching, Config.cache.static.cache_period_in_seconds);
                }
                else if (ie.isA(File))
                {
                    File.findByUri(requestedResourceURI, function (err, file)
                    {
                        if (isNull(err))
                        {
                            if (!isNull(file))
                            {
                                const mimeType = Config.mimeType(file.ddr.fileExtension);

                                if (!isNull(Config.thumbnailableExtensions[file.ddr.fileExtension]))
                                {
                                    file.getThumbnail(size, function (err, writtenFilePath)
                                    {
                                        if (isNull(err))
                                        {
                                            if (!isNull(writtenFilePath))
                                            {
                                                const fs = require("fs");
                                                const path = require("path");
                                                let fileStream = fs.createReadStream(writtenFilePath);
                                                let filename = path.basename(writtenFilePath);

                                                res.writeHead(200,
                                                    {
                                                        "Content-Disposition": contentDisposition(filename),
                                                        "Content-type": mimeType
                                                    });

                                                fileStream.pipe(res);
                                            }
                                            else
                                            {
                                                const error = "There was an error streaming the requested resource : " + requestedResourceURI;
                                                Logger.log("error", error);
                                                res.writeHead(500, error);
                                                res.end();
                                            }
                                        }
                                        else
                                        {
                                            if (err === 404)
                                            {
                                                const error = "There was already a prior attempt to delete this file. The file is now deleted but still appears in the file explorer due to a past error. Try deleting it again to fix the issue. " + requestedResourceURI;
                                                Logger.log("error", error);
                                                res.writeHead(404, error);
                                                res.end();
                                            }
                                            else
                                            {
                                                // try to regenerate thumbnails
                                                file.generateThumbnails(function (err, result)
                                                {});

                                                const error = "Unable to produce temporary file to download " + requestedResourceURI + ". Error reported :" + writtenFilePath;
                                                res.writeHead(404, error);
                                                res.end();
                                                Logger.log("error", error);
                                            }
                                        }
                                    });
                                }
                                else
                                {
                                    exports.serve_static(
                                        req,
                                        res,
                                        Pathfinder.absPathInPublicFolder("/images/icons/extensions/file_extension_" + file.ddr.fileExtension + ".png"),
                                        Pathfinder.absPathInPublicFolder("/images/icons/file.png"),
                                        Config.cache.static.etag_cache_active
                                    );
                                }
                            }
                            else
                            {
                                const error = "Non-existent file : " + requestedResourceURI;
                                Logger.log("error", error);
                                res.writeHead(404, error);
                                res.end();
                            }
                        }
                        else
                        {
                            const error = "Error fetching thumbnail for file " + requestedResourceURI;
                            Logger.log("error", error);
                            res.writeHead(500, error);
                            res.end();
                        }
                    });
                }
                else
                {
                    exports.serve_static(req, res, "/images/icons/document_empty.png", "/images/icons/document_empty.png", Config.cache.static.last_modified_caching, Config.cache.static.cache_period_in_seconds, 500);
                }
            }
            else
            {
                exports.serve_static(req, res, "/images/icons/document_empty.png", "/images/icons/document_empty.png", Config.cache.static.last_modified_caching, Config.cache.static.cache_period_in_seconds, 404);
            }
        }
        else
        {
            exports.serve_static(req, res, "/images/icons/document_empty.png", "/images/icons/document_empty.png", Config.cache.static.last_modified_caching, Config.cache.static.cache_period_in_seconds, 500);
        }
    });
};

exports.upload = function (req, res)
{
    const fs = require("fs");

    const requestedResourceURI = req.params.requestedResourceUri;

    const sendResponse = function (status, responseObject)
    {
        if (isNull(status))
        {
            res.json(responseObject);
        }
        else
        {
            res.status(status).json(responseObject);
        }
    };

    const getProjectFromResource = function (resource, callback)
    {
        resource.getOwnerProject(function (err, project)
        {
            if (isNull(err))
            {
                callback(err, project);
            }
            else
            {
                const msg = "Unable to retrieve owner project of resource with uri : " + req.params.requestedResourceUri + ". Error retrieved : " + project;
                const newError = {
                    statusCode: 500,
                    message: msg
                };
                callback(newError, project);
            }
        });
    };

    const buildFileSystemPostFromUpload = function (creatorUri, project, file, callback)
    {
        FileSystemPost.buildFromUpload(creatorUri, project, file, function (err, newfileSystemPost)
        {
            if (isNull(err))
            {
                newfileSystemPost.save(function (err, fileSystemPost)
                {
                    if (isNull(err))
                    {
                        event = new Event("post", fileSystemPost.uri, fileSystemPost.dcterms.creator, fileSystemPost.ddr.projectUri);
                        event.saveToMySQL(function (err) {
                            if (isNull(err))
                            {
                                Logger.log("Event \"post\" saved to MySQL");
                            }
                            else
                            {
                                Logger.log("error", err);
                            }
                        });
                        callback(err, fileSystemPost);
                    }
                    else
                    {
                        const msg = "Unable to save fileSystemPost from resource with uri : " + req.params.requestedResourceUri + ". Error retrieved : " + JSON.stringify(fileSystemPost);
                        const newError = {
                            statusCode: 500,
                            message: msg
                        };
                        callback(newError, fileSystemPost);
                    }
                }, false, null, null, null, null, db_social.graphUri);
            }
            else
            {
                const msg = "Unable to build fileSystemPost from resource with uri : " + req.params.requestedResourceUri + ". Error retrieved : " + JSON.stringify(newfileSystemPost);
                const newError = {
                    statusCode: 500,
                    message: msg
                };
                callback(newError, newfileSystemPost);
            }
        });
    };

    const saveFilesAfterFinishingUpload = function (files, callback)
    {
        const fileNames = [];

        const calculateTotalSizeOfFiles = function (files, callback)
        {
            async.mapSeries(files, function (file)
            {
                fs.stat(file.path, function (err, stats)
                {
                    if (!isNull(stats))
                    {
                        callback(err, stats.size);
                    }
                    else
                    {
                        const msg = "Unable to calculate the stats of file path " + file.path;
                        Logger.log("error", msg);
                        callback(1, msg);
                    }
                });
            }, function (err, results)
            {
                if (isNull(err))
                {
                    async.reduce(results, 0, function (memo, item, callback)
                    {
                        callback(err, memo + item);
                    }, function (err, result)
                    {
                        callback(err, result);
                    });
                }
            });
        };

        if (files instanceof Array)
        {
            const getNewFileParentFolder = function (callback)
            {
                async.tryEach([
                    function (callback)
                    {
                        if (req.params.is_project_root)
                        {
                            Project.findByUri(requestedResourceURI, function (err, project)
                            {
                                if (isNull(err))
                                {
                                    if (!isNull(project))
                                    {
                                        Folder.findByUri(project.ddr.rootFolder, function (err, rootFolder)
                                        {
                                            if (isNull(err))
                                            {
                                                callback(true, rootFolder);
                                            }
                                            else
                                            {
                                                callback(false);
                                            }
                                        });
                                    }
                                    else
                                    {
                                        callback(false);
                                    }
                                }
                                else
                                {
                                    callback(false, err);
                                }
                            });
                        }
                        else
                        {
                            Folder.findByUri(requestedResourceURI, function (err, folder)
                            {
                                if (isNull(err))
                                {
                                    callback(true, folder);
                                }
                                else
                                {
                                    callback(false);
                                }
                            });
                        }
                    }
                ], function (ok, result)
                {
                    if (ok)
                    {
                        callback(null, result);
                    }
                    else
                    {
                        callback(1, result);
                    }
                });
            };

            getNewFileParentFolder(function (err, parentFolder)
            {
                if (isNull(err))
                {
                    if (parentFolder instanceof Folder)
                    {
                        parentFolder.getOwnerProject(function (err, project)
                        {
                            if (isNull(err))
                            {
                                if (project instanceof Project)
                                {
                                    calculateTotalSizeOfFiles(req.files, function (err, totalSize)
                                    {
                                        if (isNull(err))
                                        {
                                            project.getStorageSize(function (err, storageSize)
                                            {
                                                if (isNull(err))
                                                {
                                                    const storageLimit = (project.ddr.hasStorageLimit) ? project.ddr.hasStorageLimit : Config.maxProjectSize;

                                                    if (totalSize + storageSize < storageLimit)
                                                    {
                                                        async.mapSeries(files, function (file, callback)
                                                        {
                                                            fileNames.push({
                                                                name: file.name
                                                            });

                                                            if (isNull(file.error))
                                                            {
                                                                const newFile = new File({
                                                                    nie: {
                                                                        title: file.name,
                                                                        isLogicalPartOf: parentFolder.uri
                                                                    }
                                                                });

                                                                newFile.saveWithFileAndContents(file.path, function (err, newFile)
                                                                {
                                                                    if (isNull(err))
                                                                    {
                                                                        return callback(null, {
                                                                            result: "success",
                                                                            message: "File submitted successfully.",
                                                                            uri: newFile.uri
                                                                        });
                                                                    }
                                                                    const msg = "Error [" + err + "] reindexing file [" + newFile.uri + "]in GridFS :" + newFile;
                                                                    return callback(500, {
                                                                        result: "error",
                                                                        message: "Unable to save files after buffering: " + JSON.stringify(newFile),
                                                                        files: files,
                                                                        errors: newFile
                                                                    });
                                                                });
                                                            }
                                                            else
                                                            {
                                                                // The error flag in the callback is null here although there is an error
                                                                // because various files can be sent at the same time
                                                                // and if one fails -> it should be notified as such but all the other successful uploads should not be blocked
                                                                return callback(null, {
                                                                    result: "error",
                                                                    message: file.error
                                                                });
                                                            }
                                                        }, function (err, results)
                                                        {
                                                            if (isNull(err))
                                                            {
                                                                async.mapSeries(results, function (result, callback)
                                                                {
                                                                    if (result.result === "success")
                                                                    {
                                                                        File.findByUri(result.uri, function (error, file)
                                                                        {
                                                                            if (isNull(error))
                                                                            {
                                                                                getProjectFromResource(file, function (error, project)
                                                                                {
                                                                                    if (isNull(error))
                                                                                    {
                                                                                        buildFileSystemPostFromUpload(req.user.uri, project, file, function (error, result)
                                                                                        {
                                                                                            callback(error, result);
                                                                                        });
                                                                                    }
                                                                                    else
                                                                                    {
                                                                                        callback(error, project);
                                                                                    }
                                                                                });
                                                                            }
                                                                            else
                                                                            {
                                                                                callback(error, file);
                                                                            }
                                                                        });
                                                                    }
                                                                    else
                                                                    {
                                                                        callback(null, result);
                                                                    }
                                                                }, function (error, result)
                                                                {
                                                                    return callback(err, results);
                                                                });
                                                            }
                                                            else
                                                            {
                                                                return callback(err, results);
                                                            }
                                                        });
                                                    }
                                                    else
                                                    {
                                                        return callback(403, "By uploading this file you would exceed the limit of " + JSON.stringify(humanize.filesize(project.ddr.hasStorageLimit)) + " for this project.");
                                                    }
                                                }
                                                else
                                                {
                                                    return callback(500, "Error calculating the total size of the project " + project.uri);
                                                }
                                            });
                                        }
                                        else
                                        {
                                            return callback(500, "Error calculating the total size of the uploaded files " + JSON.stringify(totalSize));
                                        }
                                    });
                                }
                                else
                                {
                                    return callback(404, "Project " + project.uri + " not found.");
                                }
                            }
                            else
                            {
                                return callback(500, "Error fetching project with URI " + project.uri + " .");
                            }
                        });
                    }
                    else
                    {
                        return callback(404, "Unable to get parent folder by searching for " + requestedResourceURI + " .");
                    }
                }
                else
                {
                    return callback(500, "Error getting parent folder " + requestedResourceURI + " .");
                }
            });
        }
        else
        {
            return callback(500, {
                result: "error",
                message: "Unknown error submitting files. Malformed message?",
                files: fileNames
            });
        }
    };

    if (!isNull(req.params.requestedResourceUri))
    {
        const uploader = new Uploader();
        uploader.handleUpload(req, res, function (err, result)
        {
            if (!isNull(err))
            {
                sendResponse(err, result);
            }
            else
            {
                saveFilesAfterFinishingUpload(result, function (err, result)
                {
                    if (isNull(err))
                    {
                        sendResponse(null, result);
                    }
                    else
                    {
                        sendResponse(err, result);
                    }
                });
            }
        });
    }
    else
    {
        sendResponse(400, {
            result: "error",
            message: "Unable to determine parent folder of new uploaded file"
        });
    }
};

exports.restore = function (req, res)
{
    const performRestore = function (err, restoreInfo)
    {
        if (isNull(err))
        {
            const requestedResourceUri = req.params.requestedResourceUri;
            if (!isNull(restoreInfo) && restoreInfo instanceof Array && restoreInfo.length === 1)
            {
                const tempFilePath = restoreInfo[0].path;
                const file = new File({
                    nie: {
                        title: restoreInfo[0].name
                    }
                });

                if (file.ddr.fileExtension === "zip")
                {
                    Folder.findByUri(requestedResourceUri, function (err, folder)
                    {
                        if (isNull(err))
                        {
                            if (isNull(folder))
                            {
                                folder = new Folder({
                                    uri: requestedResourceUri
                                });
                            }

                            folder.nie.title = path.basename(restoreInfo[0].name, path.extname(restoreInfo[0].name));

                            User.findByUri(req.user, function (err, user)
                            {
                                if (isNull(err) && user instanceof User)
                                {
                                    folder.restoreFromLocalBackupZipFile(tempFilePath, user, function (err, result)
                                    {
                                        if (isNull(err))
                                        {
                                            const msg = "Successfully restored zip file to folder " + requestedResourceUri + " : " + JSON.stringify(result);
                                            Logger.log(msg);

                                            res.status(200).json(
                                                {
                                                    result: "success",
                                                    message: msg
                                                }
                                            );
                                        }
                                        else
                                        {
                                            const msg = "Error restoring zip file to folder " + requestedResourceUri + " : " + result;
                                            Logger.log(msg);

                                            res.status(500).json(
                                                {
                                                    result: "error",
                                                    message: msg
                                                }
                                            );
                                        }
                                    });
                                }
                                else
                                {
                                    const msg = "Error fetching currently logged in user during restore operation of zip file to folder " + requestedResourceUri + " : " + user;
                                    res.status(500).json(
                                        {
                                            result: "error",
                                            message: msg
                                        }
                                    );
                                }
                            });
                        }
                        else
                        {
                            res.status(500).json(
                                {
                                    result: "error",
                                    message: "resource with uri : " + requestedResourceUri + " is not a folder."
                                }
                            );
                        }
                    });
                }
                else
                {
                    res.status(500).json(
                        {
                            result: "error",
                            message: "Backup file is not a .zip file"
                        }
                    );
                }
            }
            else
            {
                res.status(500).json(
                    {
                        result: "error",
                        message: "invalid request"
                    }
                );
            }
        }
        else
        {
            res.status(500).json(
                {
                    result: "error",
                    message: "Error  performing the restore of folder: " + req.params.requestedResourceUri + "with error: " + restoreInfo
                }
            );
        }
    };

    if (!isNull(req.params.requestedResourceUri))
    {
        const uploader = new Uploader();
        uploader.handleUpload(req, res, function (err, result)
        {
            if (isNull(err))
            {
                performRestore(err, result);
            }
            else
            {
                res.status(500).json({
                    result: "error",
                    message: "Unable to perform the folder restore",
                    error: "error"
                });
            }
        });
    }
    else
    {
        res.status.json(400, {
            result: "error",
            message: "Unable to determine the folder to be restored"
        });
    }
};

exports.rm = function (req, res)
{
    const acceptsHTML = req.accepts("html");
    let acceptsJSON = req.accepts("json");

    let getProjectFromResource = function (resource, callback)
    {
        resource.getOwnerProject(function (err, project)
        {
            if (isNull(err))
            {
                callback(err, resource, project);
            }
            else
            {
                const msg = "Unable to retrieve owner project of resource with uri : " + req.params.requestedResourceUri + ". Error retrieved : " + project;
                const newError = {
                    statusCode: 500,
                    message: msg
                };
                callback(newError, project);
            }
        });
    };

    let buildFileSystemPostFromDeleteFileOperation = function (userUri, project, file, callback)
    {
        FileSystemPost.buildFromDeleteFile(userUri, project.uri, file, function (error, fileSystemPost)
        {
            if (!error)
            {
                fileSystemPost.save(function (error, post)
                {
                    if (isNull(error))
                    {
                        event = new Event("post", post.uri, post.dcterms.creator, post.ddr.projectUri);
                        event.saveToMySQL(function (err) {
                            if (isNull(err))
                            {
                                Logger.log("Event \"post\" saved to MySQL");
                            }
                            else
                            {
                                Logger.log("error", err);
                            }
                        });
                        /* res.status(200).json({
                            "result" : "success",
                            "message" : "Successfully deleted " + resourceToDelete
                        }); */
                        callback(error, post);
                    }
                    else
                    {
                        /* res.status(500).json({
                            result: "Error",
                            message: "Unable to save Social Dendro post from file system change to resource uri: " + file.uri + ". Error reported : " + error
                        }); */
                        const msg = "Unable to save Social Dendro post from a delete operation to resource uri: " + file.uri + ". Error reported : " + JSON.stringify(post);
                        const newError = {
                            statusCode: 500,
                            message: msg
                        };
                        callback(newError, post);
                    }
                }, false, null, null, null, null, db_social.graphUri);
            }
            else
            {
                /* res.status(500).json({
                    result: "Error",
                    message: "Unable to create Social Dendro post from file system change to resource uri: " + file.uri + ". Error reported : " + error
                }); */
                const msg = "Unable to create Social Dendro post from file system delete file operation to resource uri: " + file.uri + ". Error reported : " + JSON.stringify(fileSystemPost);
                const newError = {
                    statusCode: 500,
                    message: msg
                };
                callback(newError, fileSystemPost);
            }
        });
    };

    let buildFileSystemPostFromRmdirOperation = function (userUri, project, folder, reallyDelete, callback)
    {
        FileSystemPost.buildFromRmdirOperation(userUri, project, folder, reallyDelete, function (err, post)
        {
            if (!err)
            {
                post.save(function (err, post)
                {
                    if (isNull(err))
                    {
                        event = new Event("post", post.uri, post.dcterms.creator, post.ddr.projectUri);
                        event.saveToMySQL(function (err) {
                            if (isNull(err))
                            {
                                Logger.log("Event \"post\" saved to MySQL");
                            }
                            else
                            {
                                Logger.log("error", err);
                            }
                        });
                        /* res.status(200).json({
                            "result" : "success",
                            "message" : "Successfully deleted " + folder
                        }); */
                        callback(err, folder);
                    }
                    else
                    {
                        /* res.status(500).json({
                            result: "Error",
                            message: "Unable to save Social Dendro post from file system change to resource uri: " + folder.uri + ". Error reported : " + err
                        }); */
                        const msg = "Unable to save Social Dendro post from a rmdir operation to resource uri: " + folder.uri + ". Error reported : " + JSON.stringify(post);
                        const newError = {
                            statusCode: 500,
                            message: msg
                        };
                        callback(newError, post);
                    }
                }, false, null, null, null, null, db_social.graphUri);
            }
            else
            {
                /* res.status(500).json({
                    result: "Error",
                    message: "Unable to create Social Dendro post from file system change to resource uri: " + folder.uri + ". Error reported : " + err
                }); */
                const msg = "Unable to create Social Dendro post from a rmdir operation to resource uri: " + folder.uri + ". Error reported : " + JSON.stringify(post);
                const newError = {
                    statusCode: 500,
                    message: msg
                };
                callback(newError, post);
            }
        });
    };

    if (acceptsJSON && !acceptsHTML)
    {
        const resourceToDelete = req.params.requestedResourceUri;

        let reallyDelete;

        try
        {
            reallyDelete = JSON.parse(req.query.really_delete);
        }
        catch (e)
        {
            reallyDelete = false;
        }

        if (!isNull(resourceToDelete))
        {
            InformationElement.findByUri(resourceToDelete, function (err, result)
            {
                if (isNull(err))
                {
                    if (isNull(result))
                    {
                        res.status(404).json({
                            result: "error",
                            message: "Unable to find resource " + resourceToDelete
                        });
                    }
                    else
                    {
                        const deleteFolder = function (callback)
                        {
                            Folder.findByUri(resourceToDelete, function (err, folder)
                            {
                                if (isNull(err))
                                {
                                    if (isNull(folder))
                                    {
                                        return callback(null, folder);
                                    }
                                    let userUri;
                                    if (!isNull(req.user))
                                    {
                                        userUri = req.user.uri;
                                    }
                                    else
                                    {
                                        userUri = null;
                                    }

                                    folder.delete(function (err, result)
                                    {
                                        if (isNull(err))
                                        {
                                            const msg = "Successfully deleted " + resourceToDelete;
                                            return callback(null, msg);
                                        }
                                        return callback(err, result);
                                    }, userUri, false, reallyDelete);
                                }
                                else
                                {
                                    const msg = "Unable to retrieve resource with uri " + resourceToDelete + ". Error reported : " + folder;
                                    return callback(err, msg);
                                }
                            });
                        };

                        const deleteFile = function (callback)
                        {
                            File.findByUri(resourceToDelete, function (err, file)
                            {
                                if (isNull(err))
                                {
                                    if (isNull(file))
                                    {
                                        return callback(null, false);
                                    }
                                    let userUri = null;
                                    if (!isNull(req.user))
                                    {
                                        userUri = req.user.uri;
                                    }

                                    file.delete(function (err, result)
                                    {
                                        if (isNull(err))
                                        {
                                            return callback(null, result);
                                        }
                                        return callback(err, result);
                                    }, userUri, reallyDelete);
                                }
                                else
                                {
                                    const msg = "Unable to retrieve resource with uri " + resourceToDelete;
                                    return callback(err, msg);
                                }
                            });
                        };

                        const sendResponse = function (err, result)
                        {
                            if (isNull(err))
                            {
                                const msg = "Successfully deleted " + resourceToDelete;
                                res.status(200).json({
                                    result: "success",
                                    message: msg
                                });
                            }
                            else if (err === 404)
                            {
                                const msg = "There was already a prior attempt to delete this file file or folder. The file or folder is now deleted but still appears in the file explorer due to a past error. Try deleting it again to fix the issue. " + resourceToDelete;
                                Logger.log("error", msg);
                                res.writeHead(404, msg);
                                res.end();
                            }
                            else
                            {
                                const msg = "Error deleting " + resourceToDelete + ". Error reported : " + result;
                                Logger.log("error", msg);
                                res.status(500).json(
                                    {
                                        result: "error",
                                        message: msg,
                                        error: result
                                    }
                                );
                            }
                        };

                        if (result.isA(File))
                        {
                            File.findByUri(result.uri, function (err, file)
                            {
                                if (isNull(err))
                                {
                                    if (!isNull(file))
                                    {
                                        getProjectFromResource(file, function (err, resource, project)
                                        {
                                            if (isNull(err))
                                            {
                                                if (!isNull(project))
                                                {
                                                    deleteFile(function (err, result)
                                                    {
                                                        buildFileSystemPostFromDeleteFileOperation(req.user.uri, project, file, function (err, postResult)
                                                        {
                                                            sendResponse(err, result);
                                                        });
                                                    });
                                                }
                                                else
                                                {
                                                    const msg = "Could not find a project associated to " + resourceToDelete + ". Error reported : " + JSON.stringify(project);
                                                    res.status(404).json(
                                                        {
                                                            result: "error",
                                                            message: msg
                                                        }
                                                    );
                                                }
                                            }
                                            else
                                            {
                                                const msg = "Error finding project associated to " + resourceToDelete + ". Error reported : " + JSON.stringify(project);
                                                res.status(500).json(
                                                    {
                                                        result: "error",
                                                        message: msg
                                                    }
                                                );
                                            }
                                        });
                                    }
                                    else
                                    {
                                        const msg = "File : " + resourceToDelete + " does not exist";
                                        res.status(404).json(
                                            {
                                                result: "error",
                                                message: msg
                                            }
                                        );
                                    }
                                }
                                else
                                {
                                    const msg = "Error finding file : " + resourceToDelete + ". Error reported : " + JSON.stringify(file);
                                    res.status(500).json(
                                        {
                                            result: "error",
                                            message: msg
                                        }
                                    );
                                }
                            });
                        }
                        else if (result.isA(Folder))
                        {
                            Folder.findByUri(result.uri, function (err, folder)
                            {
                                if (isNull(err))
                                {
                                    if (!isNull(folder))
                                    {
                                        getProjectFromResource(folder, function (err, resource, project)
                                        {
                                            if (isNull(err))
                                            {
                                                if (!isNull(project))
                                                {
                                                    deleteFolder(function (err, result)
                                                    {
                                                        buildFileSystemPostFromRmdirOperation(req.user.uri, project, folder, reallyDelete, function (error, postResult)
                                                        {
                                                            sendResponse(err, result);
                                                        });
                                                    });
                                                }
                                                else
                                                {
                                                    const msg = "Could not find a project associated to " + resourceToDelete + ". Error reported : " + JSON.stringify(project);
                                                    res.status(404).json(
                                                        {
                                                            result: "error",
                                                            message: msg
                                                        }
                                                    );
                                                }
                                            }
                                            else
                                            {
                                                const msg = "Error finding project associated to " + resourceToDelete + ". Error reported : " + JSON.stringify(project);
                                                res.status(500).json(
                                                    {
                                                        result: "error",
                                                        message: msg
                                                    }
                                                );
                                            }
                                        });
                                    }
                                    else
                                    {
                                        const msg = "Folder : " + resourceToDelete + " does not exist";
                                        res.status(404).json(
                                            {
                                                result: "error",
                                                message: msg
                                            }
                                        );
                                    }
                                }
                                else
                                {
                                    const msg = "Error finding folder : " + resourceToDelete + ". Error reported : " + JSON.stringify(folder);
                                    res.status(500).json(
                                        {
                                            result: "error",
                                            message: msg
                                        }
                                    );
                                }
                            });
                        }
                        else
                        {
                            res.status(500).json(
                                {
                                    result: "error",
                                    message: "Error determining the type of " + resourceToDelete
                                }
                            );
                        }
                    }
                }
                else
                {
                    res.status(500).json({
                        result: "error",
                        message: "Error trying to determine if resource " + resourceToDelete + " exists.",
                        error: result
                    });
                }
            });
        }
        else
        {
            res.status(405).json({
                result: "error",
                message: "Invalid request. Unable to determine requested resource URI"
            });
        }
    }
    else
    {
        res.status(400).json({
            result: "error",
            message: "HTML Request not valid for this route."
        });
    }
};

exports.undelete = function (req, res)
{
    let acceptsHTML = req.accepts("html");
    const acceptsJSON = req.accepts("json");

    if (acceptsJSON && !acceptsHTML)
    {
        const resourceToUnDelete = req.params.requestedResourceUri;

        if (!isNull(resourceToUnDelete))
        {
            InformationElement.findByUri(resourceToUnDelete, function (err, result)
            {
                if (isNull(err))
                {
                    if (isNull(result))
                    {
                        res.status(404).json({
                            result: "error",
                            message: "Unable to find resource " + resourceToUnDelete
                        });
                    }
                    else
                    {
                        function undeleteFile (callback)
                        {
                            File.findByUri(resourceToUnDelete, function (err, file)
                            {
                                if (isNull(err))
                                {
                                    if (!isNull(file) && file instanceof File)
                                    {
                                        file.undelete(function (err, result)
                                        {
                                            if (isNull(err))
                                            {
                                                callback(null);
                                            }
                                            else
                                            {
                                                callback(err);
                                            }
                                        });
                                    }
                                    else
                                    {
                                        callback(resourceToUnDelete + " is not a file.");
                                    }
                                }
                                else
                                {
                                    callback("Unable to retrieve resource with uri " + resourceToUnDelete, false);
                                }
                            });
                        }

                        function unDeleteFolder (callback)
                        {
                            Folder.findByUri(resourceToUnDelete, function (err, folder)
                            {
                                if (isNull(err))
                                {
                                    if (!isNull(folder) && folder instanceof Folder)
                                    {
                                        folder.undelete(function (err, result)
                                        {
                                            if (isNull(err))
                                            {
                                                callback(null);
                                            }
                                            else
                                            {
                                                callback(err);
                                            }
                                        });
                                    }
                                    else
                                    {
                                        // not a folder, we will try to undelete a file with this uri
                                        callback(resourceToUnDelete + " is not a folder.");
                                    }
                                }
                                else
                                {
                                    callback("Unable to retrieve resource with uri " + resourceToUnDelete + ". Error reported : " + folder);
                                }
                            });
                        }

                        async.tryEach([
                            unDeleteFolder,
                            undeleteFile
                        ], function (err, result)
                        {
                            if (isNull(err))
                            {
                                if (isNull(err))
                                {
                                    res.status(200).json({
                                        result: "success",
                                        message: "Successfully undeleted " + resourceToUnDelete
                                    });
                                }
                                else
                                {
                                    res.status(500).json(
                                        {
                                            result: "error",
                                            message: "Error undeleting " + resourceToUnDelete + ". Error reported : " + result
                                        }
                                    );
                                }
                            }
                            else
                            {
                                res.status(500).json(
                                    {
                                        result: "error",
                                        message: "Error undeleting " + resourceToUnDelete + ". Error reported : " + result
                                    }
                                );
                            }
                        });
                    }
                }
                else
                {
                    res.status(500).json({
                        result: "error",
                        message: "Error trying to determine if resource " + resourceToUnDelete + " exists.",
                        error: result
                    });
                }
            });
        }
        else
        {
            res.status(405).json({
                result: "error",
                message: "Invalid request. Unable to determine requested resource URI"
            });
        }
    }
    else
    {
        res.status(400).json({
            result: "error",
            msg: "HTML Request not valid for this route."
        });
    }
};

exports.mkdir = function (req, res)
{
    let acceptsHTML = req.accepts("html");
    const acceptsJSON = req.accepts("json");

    if (acceptsJSON && !acceptsHTML)
    {
        let validateFolderName = function (callback)
        {
            const newFolderTitle = req.query.mkdir;

            if (!newFolderTitle.match(/^[^\\\/:*?"<>|]{1,}$/g))
            {
                return callback({
                    statusCode: 400,
                    error: {
                        result: "error",
                        message: "invalid file name specified"
                    }
                });
            }
            callback(null);
        };

        let getProjectRootFolder = function (projectUri, callback)
        {
            Project.findByUri(projectUri, function (err, project)
            {
                if (isNull(err))
                {
                    if (!isNull(project) || !(project instanceof Project))
                    {
                        if (!isNull(project.ddr.rootFolder))
                        {
                            callback(null, project.ddr.rootFolder);
                        }
                        else
                        {
                            return callback({
                                statusCode: 500,
                                error: {
                                    result: "error",
                                    message: "Unable to determine root folder of project " + projectUri
                                }
                            });
                        }
                    }
                    else
                    {
                        return callback({
                            statusCode: 404,
                            error: {
                                result: "error",
                                message: "There is no project with uri " + projectUri + "."
                            }
                        });
                    }
                }
                else
                {
                    return callback({
                        statusCode: 500,
                        error: {
                            result: "error",
                            error: project,
                            message: "Unable to retrieve project " + projectUri
                        }
                    });
                }
            });
        };

        let processRequest = function (parentFolderURI, callback)
        {
            Folder.findByUri(parentFolderURI, function (err, parentFolder)
            {
                if (isNull(err) && !isNull(parentFolder))
                {
                    const newChildFolder = new Folder({
                        nie: {
                            title: req.query.mkdir,
                            isLogicalPartOf: parentFolderURI
                        },
                        ddr: {
                            humanReadableURI: parentFolder.ddr.humanReadableURI + "/" + req.query.mkdir
                        }
                    });

                    // save parent folder
                    parentFolder.insertDescriptors([new Descriptor({
                        prefixedForm: "nie:hasLogicalPart",
                        value: newChildFolder.uri
                    })
                    ],
                    function (err, result)
                    {
                        if (isNull(err))
                        {
                            newChildFolder.save(function (err, result)
                            {
                                if (isNull(err))
                                {
                                    return callback(null, newChildFolder);
                                }
                                return callback({
                                    statusCode: 500,
                                    error: {
                                        result: "error",
                                        message: "error 1 saving new folder :" + result
                                    }
                                });
                            });
                        }
                        else
                        {
                            return callback({
                                statusCode: 500,
                                error: {
                                    result: "error",
                                    message: "error 2 saving new folder :" + result
                                }
                            });
                        }
                    });
                }
                else
                {
                    return callback({
                        statusCode: 500,
                        error: {
                            result: "error",
                            message: "error 3 saving new folder :" + parentFolder
                        }
                    }
                    );
                }
            });
        };

        let getProjectFromFolder = function (folder, callback)
        {
            // callback(err, folder, project);
            folder.getOwnerProject(function (err, project)
            {
                if (isNull(err))
                {
                    callback(err, folder, project);
                }
                else
                {
                    const msg = "Unable to retrieve owner project of resource with uri : " + req.params.requestedResourceUri + ". Error retrieved : " + project;
                    const newError = {
                        statusCode: 500,
                        message: msg
                    };
                    callback(newError, project);
                }
            });
        };

        let buildFileSystemPostFromMkdir = function (userUri, project, folder, callback)
        {
            FileSystemPost.buildFromMkdirOperation(userUri, project, folder, function (err, post)
            {
                if (!err)
                {
                    post.save(function (err, post)
                    {
                        if (!err)
                        {
                            event = new Event("post", post.uri, post.dcterms.creator, post.ddr.projectUri);
                            event.saveToMySQL(function (err) {
                                if (isNull(err))
                                {
                                    Logger.log("Event \"post\" saved to MySQL");
                                }
                                else
                                {
                                    Logger.log("error", err);
                                }
                            });
                            callback(err, folder, project);
                        }
                        else
                        {
                            /* res.status(500).json({
                                result: "Error",
                                message: "Unable to save Social Dendro post from file system change to resource uri: " + newChildFolder.uri + ". Error reported : " + err
                            }); */

                            const msg = "Unable to save Social Dendro post from file system change to resource uri: " + folder.uri + ". Error reported : " + JSON.stringify(post);
                            const newError = {
                                statusCode: 500,
                                message: msg
                            };
                            callback(newError, post);
                        }
                    }, false, null, null, null, null, db_social.graphUri);
                }
                else
                {
                    /* res.status(500).json({
                        result: "Error",
                        message: "Unable to create Social Dendro post from file system change to resource uri: " + newChildFolder.uri + ". Error reported : " + err
                    }); */
                    const msg = "Unable to create Social Dendro post from file system change to resource uri: " + folder.uri + ". Error reported : " + JSON.stringify(post);
                    const newError = {
                        statusCode: 500,
                        message: msg
                    };

                    callback(newError, post);
                }
            });
        };

        async.waterfall(
            [
                validateFolderName,
                function (callback)
                {
                    if (req.params.is_project_root)
                    {
                        getProjectRootFolder(req.params.requestedResourceUri, function (err, projectUri)
                        {
                            if (err)
                            {
                                return callback({
                                    statusCode: 500,
                                    error: {
                                        result: "error",
                                        message: "Unable to get root folder of project :" + req.params.requestedResourceUri,
                                        error: projectUri
                                    }
                                });
                            }
                            return callback(null, projectUri);
                        });
                    }
                    else
                    {
                        return callback(null, req.params.requestedResourceUri);
                    }
                },
                function (parentFolderUri, callback)
                {
                    processRequest(parentFolderUri, callback);
                },
                function (folder, callback)
                {
                    getProjectFromFolder(folder, function (err, folder, project)
                    {
                        callback(err, folder, project);
                    });
                },
                function (folder, project, callback)
                {
                    buildFileSystemPostFromMkdir(req.user.uri, project, folder, function (err, result)
                    {
                        if (isNull(err))
                        {
                            callback(null, folder);
                        }
                        else
                        {
                            callback({
                                result: "Error",
                                message: err.message
                            });
                        }
                    });
                }
            ], function (err, folder)
            {
                if (isNull(err))
                {
                    res.json({
                        status: "1",
                        id: folder.uri,
                        result: "ok",
                        new_folder: Descriptor.removeUnauthorizedFromObject(folder, [Elements.access_types.private], [Elements.access_types.api_readable])
                    });
                }
                else
                {
                    res.status(err.statusCode).json(err.error);
                }
            }
        );
    }
    else
    {
        return res.status(400).send("HTML Request not valid for this route.");
    }
};

exports.ls_by_name = function (req, res)
{
    const resourceURI = req.params.requestedResourceUri;
    let show_deleted = req.query.show_deleted;
    let childName = req.query.title;

    if (isNull(childName))
    {
        return res.status(400).json({
            result: "error",
            message: "The requestedResourceUri parameter is required"
        });
    }

    if (isNull(resourceURI))
    {
        return res.status(400).json({
            result: "error",
            message: "The title query parameter is required"
        });
    }

    const acceptsHTML = req.accepts("html");
    const acceptsJSON = req.accepts("json");

    if (!acceptsJSON && acceptsHTML)
    {
        res.status(400).json({
            result: "error",
            message: "HTML Request not valid for this route."
        });
    }
    else
    {
        Folder.findByUri(resourceURI, function (err, containingFolder)
        {
            if (isNull(err) && !isNull(containingFolder))
            {
                containingFolder.findChildWithDescriptor(new Descriptor({
                    prefixedForm: "nie:title",
                    value: childName
                }), function (err, children)
                {
                    if (isNull(err))
                    {
                        if (isNull(children))
                        {
                            res.status(404).json({
                                result: "Error",
                                message: "Child with name : " + childName + " is not a children of " + containingFolder.uri
                            });
                        }
                        else
                        {
                            res.json(children);
                        }
                    }
                    else
                    {
                        res.status(500).json({
                            result: "Error",
                            message: JSON.stringify(children)
                        });
                    }
                });
            }
            else
            {
                res.status(404).json({
                    result: "Error",
                    message: "Non-existent folder. Is this a file instead of a folder? : " + resourceURI
                });
            }
        });
    }
};

exports.ls = function (req, res)
{
    const resourceURI = req.params.requestedResourceUri;
    let showDeleted = req.query.show_deleted;

    if (req.params.is_project_root)
    {
        Project.findByUri(resourceURI, function (err, project)
        {
            if (isNull(err))
            {
                if (!isNull(project))
                {
                    project.getFirstLevelDirectoryContents(function (err, files)
                    {
                        if (isNull(err))
                        {
                            if (!showDeleted)
                            {
                                const _ = require("underscore");
                                files = _.reject(files, function (file)
                                {
                                    return file.ddr.deleted;
                                });
                            }

                            res.json(files);
                        }
                        else
                        {
                            res.status(500).json({
                                result: "error",
                                message: "Unable to fetch project root folder contents."
                            });
                        }
                    });
                }
                else
                {
                    res.status(404).json({
                        result: "error",
                        message: "Unable to fetch project with uri : " + req.params.requestedResourceUri + ". Project not found! "
                    });
                }
            }
            else
            {
                res.status(500).json({
                    result: "error",
                    message: "Unable to fetch project with uri : " + req.params.requestedResourceUri
                });
            }
        });
    }
    else
    {
        Folder.findByUri(resourceURI, function (err, containingFolder)
        {
            if (isNull(err) && !isNull(containingFolder))
            {
                containingFolder.getLogicalParts(function (err, children)
                {
                    if (isNull(err))
                    {
                        if (!showDeleted)
                        {
                            const _ = require("underscore");
                            children = _.reject(children, function (child)
                            {
                                return child.ddr.deleted;
                            });
                        }

                        res.json(children);
                    }
                });
            }
            else
            {
                res.status(404).json({
                    result: "Error",
                    error: "Non-existent folder. Is this a file instead of a folder? : " + resourceURI
                });
            }
        });
    }
};

exports.extension_icon = function (req, res)
{
    const extension = req.params[0];
    if (!isNull(extension) && !isNull(Config.iconableFileExtensions[extension]))
    {
        exports.serve_static(req, res, "/images/icons/extensions/file_extension_" + requestedExtension + ".png", "/images/icons/file.png", Config.cache.static.last_modified_caching, Config.cache.static.cache_period_in_seconds);
    }
    else
    {
        exports.serve_static(req, res, "/images/icons/document_empty.png", "/images/icons/document_empty.png", Config.cache.static.last_modified_caching, Config.cache.static.cache_period_in_seconds);
    }
};

exports.thumbnail = function (req, res)
{
    if (!req.params.is_project_root)
    {
        const path = require("path");

        InformationElement.findByUri(req.params.requestedResourceUri, function (err, resource)
        {
            if (!err)
            {
                if (!isNull(resource))
                {
                    const requestedExtension = resource.ddr.fileExtension;

                    if (isNull(requestedExtension))
                    {
                        exports.serve_static(req, res, "/images/icons/document_empty.png", null, Config.cache.static.last_modified_caching, Config.cache.static.cache_period_in_seconds);
                    }
                    else if (!isNull(requestedExtension) && !isNull(Config.thumbnailableExtensions[requestedExtension]))
                    {
                        exports.get_thumbnail(req, res);
                    }
                    else if (requestedExtension === "" || requestedExtension === "folder")
                    {
                        exports.serve_static(req, res, "/images/icons/folder.png", null, Config.cache.static.last_modified_caching, Config.cache.static.cache_period_in_seconds);
                    }
                    else
                    {
                        if (!isNull(Config.iconableFileExtensions[requestedExtension]))
                        {
                            exports.serve_static(req, res, "/images/icons/extensions/file_extension_" + requestedExtension + ".png", "/images/icons/file.png", Config.cache.static.last_modified_caching, Config.cache.static.cache_period_in_seconds);
                        }
                        else
                        {
                            exports.serve_static(req, res, "/images/icons/document_empty.png", "/images/icons/document_empty.png", Config.cache.static.last_modified_caching, Config.cache.static.cache_period_in_seconds);
                        }
                    }
                }
                else
                {
                    exports.serve_static(req, res, "/images/icons/emotion_question.png", "/images/icons/emotion_question.png", Config.cache.static.last_modified_caching, Config.cache.static.cache_period_in_seconds, 404);
                }
            }
            else
            {
                exports.serve_static(req, res, "/images/icons/exclamation.png", "/images/icons/exclamation.png", Config.cache.static.last_modified_caching, Config.cache.static.cache_period_in_seconds, 500);
            }
        });
    }
    else
    {
        exports.serve_static(req, res, "/images/icons/box_closed.png", "/images/icons/emotion_question.png", Config.cache.static.last_modified_caching, Config.cache.static.cache_period_in_seconds);
    }
};

exports.serve_static = function (req, res, pathOfIntendedFileRelativeToProjectRoot, pathOfFileToServeOnError, staticFileCaching, cachePeriodInSeconds, statusCode)
{
    const fs = require("fs");
    const path = require("path");

    const extension = path.extname(pathOfIntendedFileRelativeToProjectRoot).replace(".", "");
    const mimeType = Config.mimeType(extension);

    if (isNull(statusCode))
    {
        statusCode = 200;
    }

    const pipeFile = function (absPathOfFileToServe, filename, res, lastModified, cachePeriodInSeconds)
    {
        fs.createReadStream(absPathOfFileToServe);

        if (staticFileCaching === true && (typeof cachePeriodInSeconds === "number"))
        {
            res.setHeader("Last-Modified", lastModified);
            res.setHeader("Cache-Control", "public, max-age=" + cachePeriodInSeconds);
            res.setHeader("Date", new Date().toString());
        }

        res.writeHead(statusCode,
            {
                "Content-Disposition": contentDisposition(filename),
                "Content-type": mimeType
            });

        const fileStream = fs.createReadStream(absPathOfFileToServe);
        fileStream.pipe(res);
    };

    if (typeof pathOfIntendedFileRelativeToProjectRoot === "string")
    {
        const fileName = path.basename(pathOfIntendedFileRelativeToProjectRoot);
        var absPathOfFileToServe = Pathfinder.absPathInPublicFolder(pathOfIntendedFileRelativeToProjectRoot);

        fs.exists(absPathOfFileToServe, function (exists)
        {
            if (exists)
            {
                fs.stat(absPathOfFileToServe, function (err, stats)
                {
                    if (stats.isFile())
                    {
                        if (staticFileCaching)
                        {
                            let clientLastModifiedTimestamp = req.get("If-Modified-Since");

                            if (!isNull(clientLastModifiedTimestamp))
                            {
                                clientLastModifiedTimestamp = new Date(clientLastModifiedTimestamp);

                                const util = require("util");
                                const mtime = new Date(util.inspect(stats.mtime));

                                if (mtime > clientLastModifiedTimestamp)
                                {
                                    pipeFile(absPathOfFileToServe, fileName, res, mtime);
                                }
                                else
                                {
                                    res.writeHead(304,
                                        {
                                            Date: new Date().toString()
                                        });

                                    res.end();
                                }
                            }
                            else
                            {
                                pipeFile(absPathOfFileToServe, fileName, res, null, cachePeriodInSeconds);
                            }
                        }
                        else
                        {
                            pipeFile(absPathOfFileToServe, fileName, res, null, cachePeriodInSeconds);
                        }
                    }
                    else
                    {
                        res.status(404) // HTTP status 404: NotFound
                            .send("Not found");
                    }
                });
            }
            else
            {
                if (!isNull(pathOfFileToServeOnError))
                {
                    exports.serve_static(req, res, pathOfFileToServeOnError);
                }
                else
                {
                    res.status(404) // HTTP status 404: NotFound
                        .send("Not found");
                }
            }
        });
    }
    else
    {
        res.status(500) // HTTP status 404: NotFound
            .send("Error serving static file. Path not valid " + pathOfIntendedFileRelativeToProjectRoot);
    }
};

exports.recent_changes = function (req, res)
{
    const acceptsHTML = req.accepts("html");
    let acceptsJSON = req.accepts("json");

    if (!acceptsJSON && acceptsHTML)
    {
        res.status(400).json({
            result: "error",
            message: "HTML Request not valid for this route."
        });
    }
    else
    {
        InformationElement.findByUri(req.params.requestedResourceUri, function (err, fileOrFolder)
        {
            if (isNull(err))
            {
                if (!isNull(fileOrFolder) && fileOrFolder instanceof InformationElement)
                {
                    const offset = parseInt(req.query.offset);
                    const limit = parseInt(req.query.limit);

                    fileOrFolder.getArchivedVersions(offset, limit, function (err, versions)
                    {
                        if (isNull(err))
                        {
                            if (isNull(err))
                            {
                                if (versions instanceof Array)
                                {
                                    for (var i = 0; i < versions.length; i++)
                                    {
                                        versions[i] = Descriptor.removeUnauthorizedFromObject(versions[i], [Elements.access_types.locked], [Elements.access_types.api_readable]);
                                    }

                                    res.json(versions);
                                }
                                else
                                {
                                    res.status(500).json({
                                        result: "error",
                                        message: "Versions of : " + req.params.requestedResourceUri + " are not correctly represented in the database"
                                    });
                                }
                            }
                            else
                            {
                                res.status(500).json({
                                    result: "error",
                                    message: "Error getting recent changes from project : " + fileOrFolder.uri + " : " + versions
                                });
                            }
                        }
                        else
                        {
                            res.status(500).json({
                                result: "error",
                                message: "Error occurred while trying to get the owner project of resource : " + req.params.requestedResourceUri + " : " + project
                            });
                        }
                    });
                }
                else
                {
                    res.status(404).json({
                        result: "error",
                        message: "Unable to find file or folder with uri : " + req.params.requestedResourceUri
                    });
                }
            }
            else
            {
                res.status(500).json({
                    result: "error",
                    message: "Invalid project : " + req.params.requestedResourceUri + " : " + project
                });
            }
        });
    }
};

exports.sheets = function (req, res)
{
    if (isNull(req.params.showing_project_root))
    {
        const resourceURI = req.params.requestedResourceUri;
        File.findByUri(resourceURI, function (err, file)
        {
            if (isNull(err))
            {
                if (!isNull(file) && file instanceof File)
                {
                    file.getSheets(function (err, sheets)
                    {
                        if (!err)
                        {
                            res.json(sheets);
                        }
                        else
                        {
                            const error = "Error occurred while fetching sheets for " + resourceURI;
                            Logger.log("error", error);
                            res.status(500).json({
                                result: "error",
                                message: error,
                                error: err
                            });
                        }
                    });
                }
                else
                {
                    const error = resourceURI + " does not exist or is not a file.";
                    Logger.log("error", error);
                    res.status(404).json({
                        result: "error",
                        message: error
                    });
                }
            }
        });
    }
    else
    {
        const projects = require(Pathfinder.absPathInSrcFolder("/controllers/projects.js"));
        projects.show(req, res);
    }
};

exports.data = function (req, res)
{
    if (isNull(req.params.showing_project_root))
    {
        const resourceURI = req.params.requestedResourceUri;
        let skip;
        let pageSize;
        let sheetIndex;
        let format;

        if (!isNull(req.query.skip))
        {
            skip = parseInt(req.query.skip);
        }

        if (!isNull(req.query.page_size))
        {
            pageSize = parseInt(req.query.page_size);
        }

        if (!isNull(req.query.sheet_index))
        {
            sheetIndex = parseInt(req.query.sheet_index);
        }

        if (!isNull(req.query.format))
        {
            format = req.query.format;
        }

        File.findByUri(resourceURI, function (err, file)
        {
            if (isNull(err))
            {
                if (!isNull(file) && file instanceof File)
                {
                    if (!isNull(file.ddr.hasDataProcessingError))
                    {
                        res.status(500).json({
                            result: "error",
                            error: file.ddr.hasDataProcessingError
                        });
                    }
                    else if (file.ddr.hasDataContent)
                    {
                        if (req.query.format === "csv")
                        {
                            res.set("Content-Type", "text/csv");
                        }
                        else
                        {
                            res.set("Content-Type", "application/json");
                        }

                        file.pipeData(res, skip, pageSize, sheetIndex, format);
                    }
                    else
                    {
                        if (!isNull(Config.dataStoreCompatibleExtensions[file.ddr.fileExtension]))
                        {
                            file.rebuildData(function (err, result)
                            {
                                if (isNull(err))
                                {
                                    if (req.query.format === "csv")
                                    {
                                        res.set("Content-Type", "text/csv");
                                    }
                                    else
                                    {
                                        res.set("Content-Type", "application/json");
                                    }

                                    file.pipeData(res, null, null, null, format);
                                }
                                else
                                {
                                    Logger.log("error", result);
                                    res.status(500).json({
                                        result: "error",
                                        message: result
                                    });
                                }
                            });
                        }
                        else
                        {
                            const error = resourceURI + " has no data.";
                            Logger.log("error", error);
                            res.status(400).json({
                                result: "error",
                                message: error
                            });
                        }
                    }
                }
                else
                {
                    const error = "Non-existent file : " + resourceURI;
                    Logger.log("error", error);
                    res.writeHead(404, error);
                    res.end();
                }
            }
            else
            {
                const error = "Error retrieving file : " + resourceURI;
                Logger.log("error", error);
                res.writeHead(500, error);
                res.end();
            }
        });
    }
    else
    {
        const projects = require(Pathfinder.absPathInSrcFolder("/controllers/projects.js"));
        projects.show(req, res);
    }
};

exports.owner_project = function (req, res)
{
    const resourceURI = req.params.requestedResourceUri;

    InformationElement.findByUri(resourceURI, function (err, ie)
    {
        if (isNull(err))
        {
            if (!isNull(ie))
            {
                ie.getOwnerProject(function (err, ownerProject)
                {
                    if (isNull(err))
                    {
                        if (!isNull(ownerProject))
                        {
                            res.json({
                                result: "ok",
                                uri: ownerProject.uri
                            });
                        }
                        else
                        {
                            const error = "Resource : " + resourceURI + " does not have an owner project.";
                            Logger.log("error", error);
                            res.status(404).json({
                                result: "error",
                                message: error
                            });
                        }
                    }
                    else
                    {
                        const error = "Error fetching owner project of resource : " + resourceURI + ":" + ownerProject;
                        Logger.log("error", error);
                        res.status(500).json({
                            result: "error",
                            message: error
                        });
                    }
                });
            }
            else
            {
                const error = "Non-existent resource : " + resourceURI;
                Logger.log("error", error);
                res.status(404).json({
                    result: "error",
                    message: error
                });
            }
        }
        else
        {
            const error = "Error accessing resource : " + resourceURI + ":" + ie;
            Logger.log("error", error);
            res.status(500).json({
                result: "error",
                message: error
            });
        }
    });
};

exports.rename = function (req, res)
{
    const resourceURI = req.params.requestedResourceUri;
    const newName = req.query.rename;

    if (!isNull(newName))
    {
        if (newName.match(/^[^\\\/:*?"<>|]{1,}$/g))
        {
            InformationElement.findByUri(resourceURI, function (err, ie)
            {
                if (isNull(err))
                {
                    if (!isNull(ie))
                    {
                        if (ie.isA(File))
                        {
                            ie = new File(ie);
                        }
                        else
                        {
                            ie = new Folder(ie);
                        }

                        if (isNull(ie.ddr.fileExtension) || ie.ddr.fileExtension === "folder" || ie.ddr.fileExtension === "")
                        {
                            ie.nie.title = newName;
                        }
                        else
                        {
                            ie.nie.title = newName + "." + ie.ddr.fileExtension;
                        }

                        ie.needsRenaming(function (err, shouldRename)
                        {
                            if (isNull(err))
                            {
                                if (shouldRename === false)
                                {
                                    ie.rename(ie.nie.title, function (err, result)
                                    {
                                        if (isNull(err))
                                        {
                                            res.json({
                                                result: "ok",
                                                message: "File successfully renamed."
                                            });
                                        }
                                        else
                                        {
                                            const error = "Error occurred while renaming resource : " + resourceURI + ": " + JSON.stringify(result);
                                            Logger.log("error", error);
                                            res.status(500).json({
                                                result: "error",
                                                message: error
                                            });
                                        }
                                    });
                                }
                                else
                                {
                                    let errorMessage = "There already exists a resource with the name " + ie.nie.title + " in this location" + ", please try another name!";
                                    res.status(412).json({
                                        result: "error",
                                        message: errorMessage
                                    });
                                }
                            }
                            else
                            {
                                const error = "Error occurred while renaming resource : " + resourceURI + ": " + JSON.stringify(shouldRename);
                                Logger.log("error", error);
                                res.status(500).json({
                                    result: "error",
                                    message: error
                                });
                            }
                        });
                    }
                    else
                    {
                        const error = "Non-existent resource : " + resourceURI;
                        Logger.log("error", error);
                        res.status(404).json({
                            result: "error",
                            message: error
                        });
                    }
                }
                else
                {
                    const error = "Error accessing resource : " + resourceURI + ":" + ie;
                    Logger.log("error", error);
                    res.status(500).json({
                        result: "error",
                        message: error
                    });
                }
            });
        }
        else
        {
            res.status(400).json(
                {
                    result: "error",
                    message: "Invalid new name specified. "
                }
            );
        }
    }
    else
    {
        res.status(400).json(
            {
                result: "error",
                message: "No new name supplied! "
            }
        );
    }
};

const getTargetFolder = function (req, callback)
{
    const resourceUri = req.params.requestedResourceUri;
    if (req.params.is_project_root)
    {
        Project.findByUri(resourceUri, function (err, project)
        {
            if (isNull(err))
            {
                if (!isNull(project) && project instanceof Project)
                {
                    project.getRootFolder(function (err, result)
                    {
                        callback(err, result);
                    });
                }
                else
                {
                    callback(404, "Project with uri " + resourceUri + " does not exist");
                }
            }
            else
            {
                callback(500, "Error occurred while fetching project with uri " + resourceUri);
            }
        });
    }
    else
    {
        Folder.findByUri(resourceUri, function (err, folder)
        {
            if (isNull(err))
            {
                if (!isNull(folder))
                {
                    callback(err, folder);
                }
                else
                {
                    callback(404, "Folder " + resourceUri + " does not exist. Are you trying to copy or move files to inside a file instead of a folder?");
                }
            }
            else
            {
                res.status(500).json("Error occurred while fetching project with uri " + resourceUri);
            }
        });
    }
};

const checkIfUserHasPermissionsOverFiles = function (req, permissions, files, callback)
{
    const user = req.user;
    if (req.session.isAdmin) // admin is GOD
    {
        callback(null);
    }
    else
    {
        const Permissions = Object.create(require(Pathfinder.absPathInSrcFolder("/models/meta/permissions.js")).Permissions);

        async.mapSeries(files, function (fetchedFile, callback)
        {
            async.detect(permissions, function (role, callback)
            {
                Permissions.checkUsersRoleInParentProject(req, user, role, fetchedFile, function (err, hasRole)
                {
                    return callback(err, hasRole);
                });
            }, function (err, role)
            {
                if (isNull(err) && !isNull(role))
                {
                    return callback(null);
                }
                return callback(1, "You do not have the necessary permissions to move resource " + fetchedFile.uri + ". Details: You are not a creator or contributor of the project to which the resource belongs.");
            });
        }, function (err, result)
        {
            return callback(err, result);
        });
    }
};

const checkIfFilesExist = function (files, callback)
{
    async.mapSeries(files, function (fileUri, callback)
    {
        InformationElement.findByUri(fileUri, function (err, fileToMove)
        {
            if (isNull(err))
            {
                if (!isNull(fileToMove))
                {
                    return callback(null, fileToMove);
                }
                return callback(1, "Resource " + fileUri + " does not exist.");
            }
            return callback(1, "Error verifying if " + fileUri + " exists.");
        });
    }, function (err, filesToBeMoved)
    {
        return callback(err, filesToBeMoved);
    });
};

const checkIfDestinationIsNotTheSameAsMovedFilesParents = function (filesToMove, targetFolder, callback)
{
    async.mapSeries(filesToMove, function (fileToMove, callback)
    {
        fileToMove.getParent(function (err, parent)
        {
            if (isNull(err))
            {
                if (!isNull(parent) && parent instanceof Folder)
                {
                    if (parent.uri !== targetFolder.uri)
                    {
                        callback(null);
                    }
                    else
                    {
                        callback(3, "Cannot move a folder or resource to the same place where it already is. In this case, folder " + fileToMove.uri + " is already in " + targetFolder.uri);
                    }
                }
                else
                {
                    callback(3, "Error while determining the parent of resource " + fileToMove.uri + ". It has a null parent!");
                }
            }
            else
            {
                return callback(2, "Unable to determine the parent of resource " + filesToMove.uri + " when validating if it is already inside the destination folder.");
            }
        });
    }, function (err, results)
    {
        callback(err, results);
    });
};

const checkIfDestinationIsNotContainedByAnySource = function (filesToMove, targetFolder, callback)
{
    async.mapSeries(filesToMove, function (fileToMove, callback)
    {
        targetFolder.containedIn(fileToMove, function (err, contained)
        {
            if (isNull(err))
            {
                if (!contained)
                {
                    callback(null);
                }
                else
                {
                    callback(4, "Cannot move a folder or resource to inside itself!. In this case, folder " + targetFolder.uri + " is contained in " + fileToMove.uri);
                }
            }
            else
            {
                return callback(3, "Resource " + fileUri + " does not exist.");
            }
        });
    }, function (err, results)
    {
        callback(err, results);
    });
};

const cutResources = function (resources, targetFolder, callback)
{
    async.mapSeries(resources, function (resource, callback)
    {
        resource.moveToFolder(targetFolder, function (err, result)
        {
            callback(err, result);
        });
    }, callback);
};

exports.cut = function (req, res)
{
    const acceptsHTML = req.accepts("html");
    const acceptsJSON = req.accepts("json");

    if (acceptsJSON && !acceptsHTML)
    {
        if (!isNull(req.body.files))
        {
            if (req.body.files instanceof Array)
            {
                let files = req.body.files;
                const Permissions = Object.create(require(Pathfinder.absPathInSrcFolder("/models/meta/permissions.js")).Permissions);

                const permissions = [
                    Permissions.settings.role.in_owner_project.contributor,
                    Permissions.settings.role.in_owner_project.creator
                ];

                getTargetFolder(req, function (err, targetFolder)
                {
                    if (!err)
                    {
                        if (!isNull(targetFolder) && targetFolder instanceof Folder)
                        {
                            checkIfFilesExist(files, function (err, filesToBeMoved)
                            {
                                if (isNull(err))
                                {
                                    checkIfDestinationIsNotTheSameAsMovedFilesParents(filesToBeMoved, targetFolder, function (err, result)
                                    {
                                        if (isNull(err))
                                        {
                                            checkIfDestinationIsNotContainedByAnySource(filesToBeMoved, targetFolder, function (err, result)
                                            {
                                                if (isNull(err))
                                                {
                                                    checkIfUserHasPermissionsOverFiles(req, permissions, filesToBeMoved, function (err, hasPermissions)
                                                    {
                                                        if (isNull(err))
                                                        {
                                                            cutResources(filesToBeMoved, targetFolder, function (err, result)
                                                            {
                                                                if (isNull(err))
                                                                {
                                                                    return res.json({
                                                                        result: "ok",
                                                                        message: "Files moved successfully"
                                                                    });
                                                                }
                                                                return res.status(500).json({
                                                                    result: "error",
                                                                    message: "An error occurred while moving files.",
                                                                    error: result
                                                                });
                                                            });
                                                        }
                                                        else
                                                        {
                                                            return res.status(500).json({
                                                                result: "error",
                                                                message: "An error occurred while checking permissions over the files you are trying to move.",
                                                                error: hasPermissions
                                                            });
                                                        }
                                                    });
                                                }
                                                else
                                                {
                                                    return res.status(400).json({
                                                        result: "error",
                                                        message: "Cannot move a resource to inside itself.",
                                                        error: result
                                                    });
                                                }
                                            });
                                        }
                                        else
                                        {
                                            return res.status(400).json({
                                                result: "error",
                                                message: "Cannot move a resource to the same folder where it already is.",
                                                error: result
                                            });
                                        }
                                    });
                                }
                                else
                                {
                                    return res.status(404).json({
                                        result: "error",
                                        message: "Some of the files that were asked to be moved do not exist.",
                                        error: filesToBeMoved
                                    });
                                }
                            });
                        }
                        else
                        {
                            return res.status(404).json({
                                result: "error",
                                error: err,
                                message: "Unable to find target tolder!"
                            });
                        }
                    }
                    else
                    {
                        return res.status(err).json({
                            result: "error",
                            message: "An error occurred while fetching the destination folder of the move operation.\n" + JSON.stringify(targetFolder),
                            error: targetFolder
                        });
                    }
                });
            }
            else
            {
                const error = "The 'files' parameter is not a valid array of files and folders";
                Logger.log("error", error);
                return res.status(400).json({
                    result: "error",
                    message: error
                });
            }
        }
        else
        {
            const error = "Missing 'files' parameter; Unable to determine which files to move!";
            Logger.log("error", error);
            return res.status(400).json({
                result: "error",
                message: error
            });
        }
    }
    else
    {
        res.status(400).json({
            result: "error",
            message: "HTML Request not valid for this route."
        });
    }
};
