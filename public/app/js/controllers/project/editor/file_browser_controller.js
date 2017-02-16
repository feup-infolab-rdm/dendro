angular.module('dendroApp.controllers')
    /*
    *  File Browser controller
    */
    .controller('fileBrowserCtrl', function (
        $scope,
        $http,
        $filter,
        $q,
        $log,
        $timeout,
        $compile,
        Upload,
        focus,
        preview,
        $localStorage,
        metadataService,
        windowService,
        cacheService,
        filesService,
        interactionsService,
        ontologiesService,
        storageService,
        recommendationService,
        usersService
    )
{
    $scope.delete_file_or_folder = function()
    {
        var selectedFiles = $scope.get_selected_files();
        if(selectedFiles.length > 0)
        {
            var message = "Are you sure you want to delete the current selection?\n\nFiles already marked as deleted will be deleted FOREVER!";

            bootbox.confirm(message, function(result) {
                if(result)
                {
                    async.map(selectedFiles, function(selectedFile, callback){
                        var forever = selectedFile.ddr.deleted;

                        var extension = selectedFile.ddr.fileExtension;

                        if(extension == "folder")
                        {
                            var successMessage = "Folder " + selectedFile.nie.title + " deleted successfully";
                        }
                        else
                        {
                            var successMessage = "File " + selectedFile.nie.title + " deleted successfully";
                        }

                        filesService.rm(selectedFile,
                            forever
                        ).then(function(response){
                            callback(null, response);
                            $scope.show_popup("success", "Success", successMessage);
                        })
                        .catch(function(e){
                            console.error("Unable to delete " + selectedFile.uri + JSON.stringify(e));
                            windowService.show_popup("error", "Error", e.statusText);
                            callback(1, "Unable to delete " + selectedFile.uri);
                        });
                    }, function(err, results){
                        if(!err)
                        {
                            $scope.clear_selected_files();
                            $scope.load_folder_contents($scope.shared.showing_deleted_files);
                            $scope.load_metadata();
                        }
                    });
                }
            });
        }
    };

    $scope.undelete_file_or_folder = function()
    {
        var selectedFiles = $scope.get_selected_files();
        if(selectedFiles.length > 0)
        {
            var message = "Are you sure you want to undelete the current selection?";

            bootbox.confirm(message, function(result) {
                if(result)
                {
                    async.map(selectedFiles, function(selectedFile, callback){
                        var extension = selectedFile.ddr.fileExtension;

                        if(extension == "folder")
                        {
                            var successMessage = "Folder " + selectedFile.nie.title + " undeleted successfully";
                        }
                        else
                        {
                            var successMessage = "File " + selectedFile.nie.title + " undeleted successfully";
                        }

                        filesService.undelete(selectedFile).then(function(response){
                            callback(null, response);
                            $scope.show_popup("success", "Success", successMessage);
                        })
                        .catch(function(e){
                            console.error("Unable to delete " + selectedFile.uri + JSON.stringify(e));
                            windowService.show_popup("error", "Error", e.statusText);
                        });
                    }, function(err, results)
                    {
                        if(!err)
                        {
                            $scope.clear_selected_files();
                            $scope.load_folder_contents($scope.shared.showing_deleted_files);
                            $scope.load_metadata();
                        }
                    });
                }
            });
        }
    };

    $scope.toggle_upload_area = function()
    {
        $scope.upload_area_visible = !$scope.upload_area_visible;
        $scope.restore_area_visible = false;
    };

    $scope.toggle_restore_area = function()
    {
        $scope.upload_area_visible = false;
        $scope.restore_area_visible = !$scope.restore_area_visible;
    };

    $scope.mkdir = function() {
        bootbox.prompt('Please enter the name of the new folder', function(newFolderName) {
            if(newFolderName != null)
            {

                if (!newFolderName.match(/^[^\\\/:*?"<>|]{1,}$/g))
                {
                    bootbox.alert("Invalid folder name specified", function ()
                    {
                    });
                }
                else
                {
                    if (newFolderName != null)
                    {
                        filesService.mkdir(newFolderName,
                            $scope.get_calling_uri()
                        ).then(function(result){
                            $scope.load_folder_contents();
                        }).catch(function(error){
                            console.error("Unable to create new folder " + JSON.stringify(error));
                            windowService.show_popup('error', ' There was an error creating the new folder', 'Server returned status code ' + status + " and message :\n" + data);
                        });
                    }
                }
            }
        });
    };

    $scope.upload_callback = function(err, result)
    {
        if(!err)
        {
            $scope.show_popup("success", "Success", "Files uploaded successfully.");
            $scope.get_folder_contents(true);
        }
        else
        {
            $scope.show_popup("error", "Error", result[0].message);
        }
    };

    $scope.restore_callback = function(err, result)
    {
        if(!err)
        {
            $scope.show_popup("success", "Success", "Backup successfully restored");
            $scope.load_metadata();
            $scope.get_folder_contents(true);
        }
        else
        {
            $scope.show_popup("error", "Error", "There was an error restoring your data.");
        }
    };

    $scope.clear_selection_and_get_parent_metadata = function()
    {
        $scope.clear_selected_files();
        $scope.load_metadata();
    };

    $scope.toggle_select_file_at_index_for_multiple_selection = function(index)
    {
        if($scope.shared.folder_contents != null && $scope.shared.folder_contents instanceof Array)
        {
            if ($scope.shared.folder_contents.length > index)
            {
                $scope.shared.folder_contents[index].selected = !$scope.shared.folder_contents[index].selected;
            }
        }
    };

    $scope.clicked_file_explorer_node = function(index)
    {
        if($scope.shared.multiple_selection_active)
        {
            $scope.toggle_select_file_at_index_for_multiple_selection(index);
        }
        else
        {
            $scope.newClickInFileExplorer = {
                index : index,
                time_stamp : new Date()
            };

            if($scope.lastClickInFileExplorer == null)
            {
                $scope.lastClickInFileExplorer = $scope.lastClickInFileExplorer = {
                    index : -1,
                    time_stamp : new Date(0)
                };
            }

            var DOUBLE_CLICK_DELTA = 500;

            $scope.$watch("$scope.newClickInFileExplorer",function(val)
            {
                if($scope.newClickInFileExplorer){
                    //DOUBLE CLICK: Second click registered in the waiting for second click period
                    if($scope.waitingForSecondClickInFileExplorer)
                    {
                        if($scope.lastClickInFileExplorer.index === $scope.newClickInFileExplorer.index)
                        {
                            $scope.change_location(
                                $scope.shared.folder_contents[index].uri,
                                metadataService.dirty_metadata(
                                    $scope.shared.initial_metadata,
                                    $scope.shared.metadata
                                )
                            );
                            //$scope.show_popup('success', "double click", "double click");
                            $scope.lastClickInFileExplorer = null;
                            return;
                        }
                        //over a different item in the file browser
                        else
                        {
                            $scope.select_item_in_folder_browser(index);
                        }
                    }
                    //SINGLE CLICK: Click registered after the second click waiting period
                    else
                    {
                        //over the previously selected item
                        if($scope.lastClickInFileExplorer.index === $scope.newClickInFileExplorer.index && $scope.shared.selected_file != null)
                        {
                            $scope.deselect_item_in_folder_browser();
                            //$scope.show_popup('info', "SINGLE click", "SINGLE click");

                        }
                        //over a different item in the file browser
                        else
                        {
                            $scope.select_item_in_folder_browser(index);
                            //$scope.show_popup('info', "single click over a different item", "single click");
                        }

                        var set_double_click_timeout = function()
                        {
                            $timeout(function(){
                                $scope.waitingForSecondClickInFileExplorer = false;
                                //$scope.show_popup('info', "No second click", "stopped waiting for double click");
                            }, DOUBLE_CLICK_DELTA);
                        };

                        $scope.waitingForSecondClickInFileExplorer = true;
                        set_double_click_timeout();
                    }

                    $scope.lastClickInFileExplorer = $scope.newClickInFileExplorer;
                }
            });
        }
    };

    $scope.go_up_in_folder_explorer = function()
    {
        $scope.confirm_change_of_resource_being_edited(function(confirmed){
            if(confirmed)
            {
                if($scope.showing_project_root())
                {
                    usersService.get_logged_user()
                        .then(function(user){
                            if(!user)
                            {
                                window.location.href= '/projects/my';
                            }
                            else
                            {
                                window.location.href= '/projects';
                            }
                        });
                }
                else
                {
                    var url = window.location.href;
                    var regex = new RegExp('/[^/]*$');
                    var withoutLastSection = url.replace(regex, '/');

                    if(withoutLastSection.endsWith("/"))
                    {
                        withoutLastSection = withoutLastSection.substring(0, withoutLastSection.length - 1);
                    }

                    window.location.href = withoutLastSection;
                }

            }
        },
            metadataService.dirty_metadata(
                $scope.shared.initial_metadata,
                $scope.shared.metadata
            )
        );
    };

    $scope.deselect_item_in_folder_browser = function()
    {
        $scope.confirm_change_of_resource_being_edited(function(confirmed){
            if(confirmed)
            {
                $scope.clear_selected_files();

                recommendationService.get_recommendations(
                    $scope.get_calling_uri()
                );

                metadataService.load_metadata()
                    .then(
                        function(metadata)
                        {
                            $scope.shared.metadata = metadataService.deserialize_metadata(metadata);
                            $scope.shared.initial_metadata = metadataService.deserialize_metadata(metadata);
                        }
                    );

                if($scope.preview_available())
                {
                    $scope.load_preview();
                }
                if(windowService.showing_history != null && windowService.showing_history){
                    windowService.get_change_log();
                }
            }
        });
    };

    $scope.select_item_in_folder_browser = function(index)
    {
        $scope.confirm_change_of_resource_being_edited(function(confirmed){
            if(confirmed)
            {
                $scope.clear_selected_files();

                $scope.get_folder_contents()
                    .then(
                        function(folderContents)
                        {
                            var newSelectedFile = folderContents[index];

                            $scope.set_selected_file(index);

                            recommendationService.get_recommendations($scope.get_calling_uri());
                            metadataService.load_metadata($scope.get_calling_uri())
                                .then(function(metadata){
                                    $scope.shared.metadata = metadataService.deserialize_metadata(metadata);
                                    $scope.shared.initial_metadata = metadataService.deserialize_metadata(metadata);
                                });

                            if ($scope.preview_available()) // && !is_chrome())
                            {
                                $scope.load_preview();
                            }
                            if ($scope.showing_history != null && $scope.showing_history)
                            {
                                $scope.get_change_log(newSelectedFile.uri);
                            }
                        }
                    );
            }
        });
    };

    $scope.toggle_show_deleted_files = function() {
        if($scope.shared.showing_deleted_files === null || typeof $scope.shared.showing_deleted_files == "undefined")
        {
            $scope.shared.showing_deleted_files = true;
        }
        else
        {
            $scope.shared.showing_deleted_files = !$scope.shared.showing_deleted_files;
        }

        storageService.save_to_local_storage("showing_deleted_files", $scope.shared.showing_deleted_files, "shared");

        if($scope.shared.showing_deleted_files)
        {
            $scope.get_folder_contents(true);
        }
        else
        {
            $scope.get_folder_contents();
        }
    };

    $scope.toggle_multiple_selection = function()
    {
        $scope.shared.multiple_selection_active = !$scope.shared.multiple_selection_active;
        if(!$scope.shared.multiple_selection_active)
        {
            $scope.clear_selected_files();
        }
    };

    $scope.download_folder = function()
    {
        windowService.download_url($scope.get_current_url(), "?download");
    };

    $scope.backup_folder = function()
    {
        windowService.download_url($scope.get_current_url(), "?backup");
    };


    $scope.init = function()
    {
        $scope.set_from_local_storage_and_then_from_value("upload_area_visible", true);
        $scope.set_from_local_storage_and_then_from_value("restore_area_visible", false);
        $scope.set_from_local_storage_and_then_from_value("showing_deleted_files", false, $scope, "shared");
        $scope.get_folder_contents(true);

        $scope.modelOptionsObj = {
            debounce:100
        };

        $scope.multiple = true;

        $scope.pattern="*";
        $scope.acceptSelect = true;
        $scope.disabled = false;
        $scope.capture = "camera";

        /*$scope.validateObj= {
            size: {max: '2000MB', min: '1B'},
            height: {max: 12000},
            width: {max: 12000}
            //,
            //duration: {max: '5m'}
        };*/

        $scope.keepDistinct = true;
        $scope.maxFiles = 10;
        $scope.ignoreInvalid = false;

        $scope.allowDir = false;
        $scope.dropAvailable = true;


    };
});
