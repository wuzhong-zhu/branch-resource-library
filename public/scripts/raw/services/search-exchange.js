app.service('searchExchange', ["$rootScope", "userManager", function($rootScope, userManager){
  var that = this;
  var config = {
    host: "10.211.55.3:8080/anon",
    isSecure: false
  };
  // var config = {
  //   host: "diplomaticpulse.qlik.com",
  //   isSecure: true
  // };

  this.objects = {};
  this.online = false;

  this.priority;
  this.queue = [];

  var senseApp;

  qsocks.Connect(config).then(function(global){
    global.openDoc("bf6c1ed8-69fb-4378-86c2-a1c71a2b3cc1").then(function(app){
    //global.openDoc("b8cd05a8-bb43-4670-bda5-1b6ff16640b8").then(function(app){
      senseApp = app;
      $rootScope.$broadcast("senseready", app);
    }, function(error) {
        if (error.code == "1002") { //app already opened on server
            global.getActiveDoc().then(function(app){
              senseApp = app;
              $rootScope.$broadcast("senseready", app);
            });
        } else {
            console.log(error)
            $rootScope.$broadcast("senseoffline");
        }
    });
  });
  $rootScope.$on("senseready", function(params){
    that.executePriority();
    console.log('connected to sense app');
    that.online = true;
  });
  $rootScope.$on("senseoffline", function(params){
    console.log('could not connected to sense app. using mongo instead.');
    that.online = false;
  });

  this.init = function(defaultSelection){
    if(defaultSelection){
      that.addFilter({field: defaultSelection.field}, function(result){
        //result.object.getLayout().then(function(layout){
            //result.object.getListObjectData("/qListObjectDef", [{qTop:0, qLeft:0, qHeight:layout.qListObject.qSize.qcy, qWidth: 1 }]).then(function(data){
              result.object.selectListObjectValues("/qListObjectDef", defaultSelection.values, true).then(function(){
                if(defaultSelection.lock==true){
                  result.object.lock("/qListObjectDef").then(function(){
                    that.executeQueue();
                  });
                }
                else{
                  that.executeQueue();
                }
              });
            //});
        //});
      }, true);
    }
    else{
        that.executeQueue();
    }
  };

  this.executeQueue = function(){
    for (var i=0;i<that.queue.length;i++){
      that.queue[i].call();
    }
    $rootScope.$broadcast("update");
  };

  this.executePriority = function(){
    if(that.priority){
      that.priority.call(null);
    }
    else{
      that.executeQueue();
    }
  };

  this.clear = function(unlock){
    if(senseApp){
      if(unlock && unlock==true){
        senseApp.unlockAll().then(function(){
          senseApp.clearAll().then(function(){
              $rootScope.$broadcast("cleared");
          });
        });
      }
      else{
        senseApp.clearAll().then(function(){
            $rootScope.$broadcast("cleared");
        });
      }
    }
    else{
      $rootScope.$broadcast("cleared");
    }
  };

  this.render = function(){
    $rootScope.$broadcast("update");
  }
  this.fresh = function(){
      this.search("");
  }

  this.search = function(searchText){
    $rootScope.$broadcast("searching");
    that.terms = searchText.split(" ");
    senseApp.selectAssociations({qContext: "Cleared"}, that.terms, 0 ).then(function(results){
      $rootScope.$broadcast('searchResults', results);
    });
  };

  this.suggest = function(searchText){
    senseApp.searchSuggest({}, searchText.split(" ")).then(function(results){
      console.log(results);
      $rootScope.$broadcast('suggestResults', results);
    });
  };

  this.addFilter = function(options, callbackFn, priority){
    var fn;
    if(that.objects[options.id]){
      fn = function(){
        callbackFn.call(null, {object:that.objects[options.id]});
      }
    }
    else{
      fn = function(){
        var lbDef = {
          qInfo:{
            qType: "ListObject"
          },
          qListObjectDef:{
            qStateName: "$",
            qDef:{
              qFieldDefs:[options.field]
            },
            qAutoSortByState: {
              qDisplayNumberOfRows: 8
            }
          }
        };
        senseApp.createSessionObject(lbDef).then(function(response){
          //callbackFn.call(null, {handle: response.handle, object: new qsocks.GenericObject(response.connection, response.handle)});
          callbackFn.call(null, {object: response});
        });
      };
    }
    if(that.online){
      fn.call();
    }
    else{
      if(priority){
        that.priority = fn;
      }
      else{
        that.queue.push(fn);
      }
    }
  };

  //this.addResults = function(fields, pageSize, sorting, defaultSort, callbackFn, priority){
  this.addResults = function(options, callbackFn, priority){
    var fn;
    if(that.objects[options.id]){
      fn = function(){
        callbackFn.call(null, {object:that.objects[options.id]});
      }
    }
    else{
      //create a new session object
      fn = function(){
        var hDef = {
          "qInfo" : {
              "qType" : "table"
          },
          "qHyperCubeDef": {
            "qDimensions" : buildFieldDefs(options.fields, options.sortOptions),
            "qMeasures": buildMeasureDefs(options.fields),
          	"qSuppressZero": false,
          	"qSuppressMissing": false,
          	"qInterColumnSortOrder": options.defaultSort
          }
        }
        senseApp.createSessionObject(hDef).then(function(response){
          that.objects[options.id] = response;
          callbackFn.call(null, {object:response});
        });
      }
    }
    if(that.online){
      fn.call();
    }
    else{
      that.queue.push(fn);
    }
  }

  function buildFieldDefs(fields, sorting){
    var defs = [];
    for (var i=0;i<fields.length;i++){
      if(fields[i].dimension){
        var def = {
    			"qDef": {
    				"qFieldDefs": [fields[i].dimension]
          },
          qNullSuppression: fields[i].suppressNull
    		}
        if(sorting[fields[i].dimension]){
          var sort = {
            //"autoSort": false
            //"qSortByLoadOrder" : 1
          };
          sort[sorting[fields[i].dimension].sortType] = sorting[fields[i].dimension].order;
          def["qDef"]["qSortCriterias"] = [sort];
        }
        defs.push(def);
      }
    }
    return defs;
  }

  function buildMeasureDefs(fields){
    var defs = [];
    for (var i=0;i<fields.length;i++){
      if(fields[i].measure){
        var def = {
          "qDef": {
  					"qLabel": fields[i].label,
  					"qDescription": "",
  					"qDef": fields[i].measure
  				}
        }
        if(fields[i].sortType){
          def["qSortBy"] = {};
          def["qSortBy"][fields[i].sortType] = fields[i].order;
        }
        defs.push(def);
      }
    };
    return defs;
  }

}])