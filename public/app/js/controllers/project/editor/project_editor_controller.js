angular.module('dendroApp.controllers')
    /**
     *  Metadata editor controller
     */
    .controller('projectEditorCtrl', function (
        $scope,
        $rootScope,
        $http,
        $filter,
        $q,
        $log,
        focus,
        preview,
        $localStorage,
        $timeout,
        metadataService,
        windowService,
        cacheService,
        filesService,
        interactionsService,
        ontologiesService,
        storageService,
        recommendationService
    ) {

        $scope.shared = {
            metadata : null,
            initial_metadata : null,
            selected_file : null,
            folder_contents : null,
            multiple_selection_active : null,
            recommender_offline : null,
            change_log : null,
            stats : null
        };

        $scope.get_selected_file_name = function()
        {
            if($scope.shared.selected_file != null)
            {
                return $scope.shared.selected_file.nie.title;
            }
            else
            {

            }
        };

        $scope.get_calling_uri = function(queryParametersString, uri)
        {
            if(uri != null)
            {
                uri = uri + queryParametersString;
            }
            else
            {
                if(queryParametersString != null)
                {
                    if($scope.shared.selected_file != null)
                    {
                        uri = $scope.shared.selected_file.uri + queryParametersString;
                    }
                    else
                    {
                        uri = windowService.get_current_url() + queryParametersString;
                    }
                }
                else
                {
                    if($scope.shared.selected_file != null)
                    {
                        uri = $scope.shared.selected_file.uri;
                    }
                    else
                    {
                        uri = windowService.get_current_url();
                    }
                }
            }

            return uri;
        };

        $scope.get_calling_uri_thumbnail = function()
        {
            return $scope.get_thumbnail_uri($scope.get_calling_uri());
        };

        $scope.get_calling_uri_filename = function()
        {
            return $scope.get_last_section_of_url($scope.get_calling_uri());
        };

        $scope.get_owner_project_uri = function() {
            var currentUri = $scope.get_calling_uri();

            var leadingPart = currentUri.match(new RegExp("http://[\/]*.*/project\/"));
            var ownerProject = currentUri.replace(leadingPart, "");
            if(ownerProject != null && leadingPart != null)
            {
                ownerProject = ownerProject.replace(new RegExp("\/.*"), "");
                ownerProject = leadingPart + ownerProject;
            }

            return ownerProject;
        };

        $scope.showing_descriptor_selection_area = function()
        {
            return $scope.edit_mode && !$scope.showing_project_root();
        };

        $scope.preview_available = function(){

            if(!$scope.shared.multiple_selection_active)
            {
                return preview.available($scope.shared.selected_file);
            }
            else
            {
                return false;
            }
        };

        $scope.load_preview = function(){
            if($scope.shared.selected_file == null )
            {
                //não ha nenhum ficheiro seleccionado
            }
            else{
                preview.load($scope, $scope.shared.selected_file);
            }
        };

        $scope.remove_recommendations = function(removeValuesAlreadyFilledInByUser)
        {
            for(var i = 0; i < $scope.shared.metadata.length;i++){
                if($scope.get_descriptor(i) != null && $scope.get_descriptor(i) instanceof Object)
                {
                    if(
                        $scope.get_descriptor(i).just_recommended ||
                        $scope.get_descriptor(i).project_favorite ||
                        $scope.get_descriptor(i).user_favorite
                    )
                    {
                        if($scope.get_descriptor(i).value == null || removeValuesAlreadyFilledInByUser)
                        {
                            $scope.remove_descriptor_at(i, true);
                            i--;
                        }
                    }
                }
            }
        };

        $scope.toggle_edit_mode = function()
        {
            $scope.edit_mode = !$scope.edit_mode;

            if(!$scope.edit_mode)
            {
                $scope.remove_recommendations();
            }

            storageService.save_to_local_storage('edit_mode', $scope.edit_mode);
            $scope.load_preview();
        };

        $scope.save_as = function(format)
        {
            metadataService.save_as(format);
        };

        $scope.get_owner_project_uri = function()
        {
            var currentUri = $scope.get_calling_uri();
            var leadingPart = currentUri.match(new RegExp("http://[\/]*.*/project\/"));
            var ownerProject = currentUri.replace(leadingPart, "");
            if(ownerProject != null && leadingPart != null)
            {
                ownerProject = ownerProject.replace(new RegExp("\/.*"), "");
                ownerProject = leadingPart + ownerProject;
            }

            return ownerProject;
        };

        $scope.showing_project_root = function ()
        {
            if($scope.shared.selected_file != null)
            {
                return false;
            }
            else
            {
                var currentUri = $scope.get_calling_uri();
                var projectUri = $scope.get_owner_project_uri();

                var showingProjectRoot = (currentUri === projectUri) || (currentUri === projectUri + "/data");

                return showingProjectRoot;
            }
        };

        $scope.showing_descriptor_selection_area = function()
        {
            return $scope.edit_mode && !$scope.showing_project_root();
        };

        $scope.preview_available = function(){

            if(!$scope.shared.multiple_selection_active)
                return preview.available($scope.shared.selected_file);
            else return false;
        };

        $scope.load_preview = function(){
            if($scope.shared.selected_file == null )
            {
                //não ha nenhum ficheiro seleccionado
            }
            else{
                preview.load($scope,$scope.shared.selected_file);
            }
        };

        $scope.change_location = function(newLocation, validationCondition)
        {
            $scope.confirm_change_of_resource_being_edited(function(confirmed){
                if(confirmed)
                {
                    window.location.href = newLocation;
                }
            }, validationCondition);
        };

        $scope.confirm_change_of_resource_being_edited  = function(callback, validationCondition)
        {
            if(validationCondition)
            {
                bootbox.confirm("You have unsaved changes. Are you sure you want to move away from this file or folder?", function(confirmed) {
                    callback(confirmed);
                });
            }
            else
            {
                callback(true);
            }
        };

        $scope.add_descriptor = function(descriptor)
        {
            if($scope.shared.metadata == null || !($scope.shared.metadata instanceof Array))
            {
                $scope.shared.metadata = [];
            }

            $scope.shared.metadata.unshift(descriptor);
        };

        $scope.add_all_descriptors = function(descriptor_array)
        {
            if ($scope.shared.metadata == null || !($scope.shared.metadata instanceof Array))
            {
                $scope.shared.metadata = [];
            }

            for(var j = 0; j < descriptor_array.length; j++)
            {
                $scope.shared.metadata.unshift(descriptor_array[j]);
            }
        };

        $scope.remove_descriptor_at = function(index, forceDelete)
        {
            if($scope.shared.metadata != null && $scope.shared.metadata instanceof Array)
            {
                if($scope.shared.metadata[index].just_deleted)
                {
                    delete $scope.shared.metadata[index].just_deleted;
                }
                else if($scope.shared.metadata[index].just_added || $scope.shared.metadata[index].just_inherited ||$scope.shared.metadata[index].just_recommended)
                {
                    $scope.shared.metadata.splice(index,1);
                }
                else
                {
                    $scope.shared.metadata[index].just_deleted = true;
                }
            }
        };

        $scope.get_descriptor = function(descriptor_index)
        {
            if($scope.shared.metadata == null || !($scope.shared.metadata instanceof Array))
            {
                $scope.shared.metadata = [];
            }

            return $scope.shared.metadata[descriptor_index];
        };

        $scope.select_file_at_index_for_multiple_selection = function(index)
        {
            if($scope.shared.folder_contents == null || !($scope.shared.folder_contents instanceof Array))
            {
                $scope.shared.folder_contents = [];
            }

            if($scope.shared.folder_contents.length < index)
            {
                $scope.shared.folder_contents[index].selected = true;
            }
        };

        $scope.get_selected_files = function()
        {
            var selected_files = [];

            for(var i = 0; i < $scope.shared.folder_contents.length; i++)
            {
                if($scope.shared.folder_contents[i].selected)
                {
                    selected_files.push($scope.shared.folder_contents[i]);
                }
            }

            return selected_files;
        };

        $scope.set_selected_file = function(index)
        {
            if(
                $scope.shared.folder_contents != null &&
                $scope.shared.folder_contents instanceof Array &&
                index < $scope.shared.folder_contents.length
            )
            {
                $scope.shared.folder_contents[index].selected = true;
                $scope.shared.selected_file = $scope.shared.folder_contents[index];
            }
        };

        $scope.clear_selected_files = function()
        {
            if($scope.shared.folder_contents != null && $scope.shared.folder_contents instanceof Array)
            {
                for(var i = 0; i < $scope.shared.folder_contents.length; i++)
                {
                    $scope.shared.folder_contents[i].selected = false;
                }
            }

            $scope.shared.selected_file = null;
        };

        $scope.file_explorer_selected_contains_deleted = function()
        {
            var selected_files = $scope.get_selected_files();

            for(var i = 0; i < selected_files.length; i++)
            {
                var selected_file = selected_files[i];
                if(selected_file.ddr.deleted)
                {
                    return true;
                }
                else
                {
                    return false;
                }
            }
        };

        $scope.file_explorer_selected_contains_not_deleted = function()
        {
            var selected_files = $scope.get_selected_files();

            for(var i = 0; i < selected_files.length; i++)
            {
                var selected_file = selected_files[i];
                if(!selected_file.ddr.deleted)
                {
                    return true;
                }
                else
                {
                    return false;
                }
            }
        };

        $scope.file_explorer_selected_something = function()
        {
            if($scope.shared.folder_contents != null && $scope.shared.folder_contents instanceof Array)
            {
                for(var i = 0 ; i < $scope.shared.folder_contents.length; i++)
                {
                    var item = $scope.shared.folder_contents[i];

                    if(item.selected)
                    {
                        return true;
                    }
                }
            }
            else
            {
                return false;
            }
        };

        $scope.load_folder_contents = function(includingDeletedFiles)
        {
            var loadFolderContentsPromise = $q.defer();

            filesService.get_folder_contents(windowService.get_current_url(), includingDeletedFiles)
              .then(function(folder_contents){
                  $scope.shared.folder_contents = folder_contents;
                  loadFolderContentsPromise.resolve(folder_contents);
              })
              .catch(function(error){
                  loadFolderContentsPromise.reject("Unable to load folder contents from server" + JSON.stringify(error));
              });

            return loadFolderContentsPromise.promise;
        };

        $scope.get_folder_contents = function(forceReloadFromServer) {

            var getFolderContentsPromise = $q.defer();
            if($scope.shared.folder_contents == null || forceReloadFromServer)
            {
                $scope.load_folder_contents($scope.shared.showing_deleted_files)
                    .then(function(folder_contents){
                        $scope.shared.folder_contents = folder_contents;
                        getFolderContentsPromise.resolve(folder_contents);
                    })
                    .catch(function(error)
                    {
                        getFolderContentsPromise.reject("Unable to get folder contents" + JSON.stringify(error));
                    });
            }
            else
            {
                getFolderContentsPromise.resolve($scope.shared.folder_contents);
            }

            return getFolderContentsPromise.promise;
        };

        $scope.download = function()
        {
            windowService.download_url($scope.get_calling_uri(), "?download");
        };

        $scope.backup = function()
        {
            windowService.download_url($scope.get_calling_uri(), "?backup");
        };


        $scope.download_selected_items = function()
        {
            for(var i = 0 ; i < $scope.shared.folder_contents.length; i++)
            {
                var item = $scope.shared.folder_contents[i];

                if(item.selected)
                {
                    windowService.download_url(item.uri, "?download");
                }
            }
        };

        $scope.backup_selected_items = function()
        {
            for(var i = 0 ; i < $scope.shared.folder_contents.length; i++)
            {
                var item = $scope.shared.folder_contents[i];

                if(item.selected)
                {
                    windowService.download_url(item.uri, "?backup");
                }
            }
        };

        $scope.load_metadata = function()
        {
            metadataService.load_metadata($scope.get_calling_uri())
                .then(function(metadata){
                    $scope.shared.metadata = metadataService.deserialize_metadata(metadata);
                    $scope.shared.initial_metadata = metadataService.deserialize_metadata(metadata);
                });
        };

        //initialization
        $scope.init = function()
        {
            //init interface parameters
            $scope.set_from_local_storage_and_then_from_value("edit_mode", false);

            //put some services in scope i.e. to access constants

            $scope.recommendationService = recommendationService;

            //monitor url change events (ask to save if metadata changed)
            $scope.$on('$routeChangeStart', function(next, current) {
                console.log("Changing location from " + current + " to " + next);
                $scope.change_location(next,
                    metadataService.dirty_metadata(
                        $scope.shared.initial_metadata,
                        $scope.shared.metadata
                ));
            });

            //monitor a change in the selected file on the file explorer
            //and propagate to child controllers
            //eventsService.register_handler_for_event(
            //    $scope,
            //    eventsService.events.selected_file_changed,
            //    function(oldSelectedFile, newSelectedFile)
            //    {
            //       eventsService.send_event_to_children($scope, eventsService.events.selected_file_changed, newSelectedFile);
            //    }
            //);
        };
    });