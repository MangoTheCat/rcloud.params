((function () {
    // stolen from dc.graph.js, could be made its own tiny library
    // Used to retrive and update url
    var querystring = (function () {
        var _init_window_href = null;
        return {
            parse: function () {
                return (function (a) {
                    if (a == "") return {};
                    var b = {};
                    for (var i = 0; i < a.length; ++i) {
                        var p = a[i].split('=', 2);
                        if (p.length == 1)
                            b[p[0]] = "";
                        else
                            b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
                    }
                    return b;
                })(window.location.search.substr(1).split('&'));
            },
            update: function (m) {
                var base = window.location.protocol + '//' + window.location.host + window.location.pathname;
                var parts = [];
                for (var k in m)
                    parts.push(k + '=' + encodeURIComponent(m[k]));
                var url = base + '?' + parts.join('&');
                if(!this._init_window_href) {
                   this._init_window_href = window.location.href;
                   window.history.pushState(null, null, url);
                 } else {
                   window.history.replaceState(null, null, url);
                 }
                 return this;
            }
        };
    })();

    var _varmap = {}, _backend, _disabled_callbacks = [];
    
    function getInputValue(control) { // takes jquery object and extracts value
         if (control.find('button').length > 0) {
           return undefined;
         }
         if (control.find('select').length > 0) {
            let selectedOpts = _.filter($(control).find('option'), (op) => { 
              return $(op).is(':selected') && !$(op).is(':disabled');
            });
            return _.map(selectedOpts, (op) => { 
                return $(op).val();
            });
          } else if (control.find('input[type="checkbox"]').length > 0) {
            return control.find('input[type="checkbox"]').is(':checked');	
          } else if (control.find('input[type="radio"]').length > 0) {
            let selectedOpts = _.filter($(control).find('input[type="radio"]'), (op) => { 
              return $(op).is(':checked') && !$(op).is(':disabled');
            });
            let values = _.map(selectedOpts, (op) => { 
                return $(op).val();
            });
            if (values.length > 0) {
              return values[0];
            } 
            return undefined;
          } else {
            return control.find('input').val().trim();
          }
    }
    
    function getDefaultInputValue(control) { // takes jquery object and extracts value
         if (control.find('button').length > 0) {
           return undefined;
         }
         if (control.find('select').length > 0) {
            let selectedOpts = _.filter($(control).find('option'), (op) => { 
              return $(op).is('[data-rcloud-params-default-value="true"]') && !$(op).is(':disabled');
            });
            return _.map(selectedOpts, (op) => { 
                return $(op).val();
            });
          } else if (control.find('input[type="checkbox"]').length > 0) {
            return control.find('input[type="checkbox"]').is('[data-rcloud-params-default-value="true"]');	
          } else if (control.find('input[type="radio"]').length > 0) {
            let selectedOpts = _.filter($(control).find('input[type="radio"]'), (op) => { 
              return $(op).is('[data-rcloud-params-default-value="true"]') && !$(op).is(':disabled');
            });
            let values = _.map(selectedOpts, (op) => { 
                return $(op).val();
            });
            if (values.length > 0) {
              return values[0];
            } 
            return undefined;
          } else {
            let defaultValue = control.find('input').data('rcloud-params-default-value');
            if (defaultValue !== null && defaultValue !== undefined) {
              if (typeof(defaultValue) === 'string') {
               return defaultValue.trim();
              } else {
                return defaultValue;
              }
            }
            return undefined;
          }
    }
    // Schedules execution of a function within cell result processing loop to ensure that any UI element referenes used in the function
    // were added to the result pane.
    function executeInCellResultProcessingLoop(context_id, fun) {
      RCloud.session.invoke_context_callback('function_call', context_id, fun);
    }
    
    function isValueProvided(control) {
      let val = getInputValue(control);
      if (val === null || val === undefined || val === '' || val.length === 0) val = undefined;
      if(val === undefined) {
        return false;
      }
      return true;
    }
    
    function invokeBackend(el, name, val, e) {
      let form = (!el.is('form')) ? el.closest('form'): el;
      if(form.length > 0) {
        if(_disabled_callbacks.indexOf(form.get(0).id) < 0) {
            _backend.handle_event(name, val, { type: e.type });
        }
      } else {
        _backend.handle_event(name, val, { type: e.type });
      }
    }
    
    function disableCallbacksForForm(form_id) {
      _disabled_callbacks.push(form_id);
    }
    
    function enableCallbacksForForm(form_id) {
      let index = _disabled_callbacks.indexOf(form_id);
      if(index >= 0) {
        _disabled_callbacks.splice(index, 1);
      }
    }
    
    
    function setUrlQuery(key, value, defaultValue) {
      if (value !== undefined && value !== null && value !== '' && value != defaultValue) {
          _varmap[key] = value;
      } else {
          delete _varmap[key];
      }
      querystring.update(_varmap);
    }
    
    
    function validateControl(control) {
      
      let required = _.all(control.find('select, input'), (c) => { return $(c).is(':required');});
      
      if (required && !isValueProvided(control)) {
        control.addClass('has-error');
      } else {
        control.removeClass('has-error');
      }
    }
    
    function validateForm(form) {
      _.forEach(form.find('[data-rcloud-params="TRUE"]'), (el) => {
            let control = $(el);
            if(control.find('button').length === 0) {
                validateControl(control);
            }
      });
    }
    
    function isSubmitEventBound(form) {
      let events = jQuery._data( form.get(0), "events" );
      var data = (events)? events.submit : undefined;
       if (data === undefined || data.length === 0) {
        return false;
      }
      return true;
    }
    
    function onFormSubmit(form, callback, onError) {
        return function(e) {
          try {
              let invalidControls = form.find('.has-error');
              if (invalidControls.length === 0) {
                  let controls = _.filter(form.find('div[data-rcloud-params="TRUE"]'), (c) => { return $(c).find('button').length === 0; });
                  let values = _.map(controls, (control) => {
                  let $control = $(control);
                      return {
                        name: $control.data('rcloud-params-name'),
                        value: getInputValue($control)
                      };
                  });
                  if(callback) {
                    callback(form, values);
                  }
                } else {
                  $(invalidControls[0]).focus();
                }
  
            } catch (err) {
                console.error(err);
                if(onError) {
                  onError(form, err);
                }
            } finally {
                return false; // Never submit the form, it would refresh the edit screen
            }
        };
    }
    
    var result = {
        init: function (ocaps, k) {
          
          _backend = RCloud.promisify_paths(ocaps, [  // jshint ignore:line
                    ['handle_event']
                ], true);
          
          let attachCallbacks = (n) => {
                let el = $(n);
                
                if(!el.is('form') && el.find('button').length === 0) {
                
                  validateControl(el);
                
                  let input = el.find('select, input');
                  
                  let inputValue = getInputValue(el);
                  let defaultValue = getDefaultInputValue(el);
                  let name = el.data('rcloud-params-name');
                  
                  setUrlQuery(name, inputValue, defaultValue);
                  
                  input.on('change', function(e) {
                      validateControl(el);
                  });
                  
                  el.on('change', function (e) {
                      let val = getInputValue(el);
                      let input = el.find('select, input');
                      let defaultValue = getDefaultInputValue(el);
                      let name = el.data('rcloud-params-name');
      
                      if (val === '') val = undefined;
                      setUrlQuery(name, val, defaultValue);
                      invokeBackend(el, name, val, e);
                  });
                } else if(el.find('button[type="button"]').length > 0) {
                    _.forEach(el.find('button[type="button"]'), (b) => {
                      let $b = $(b);
                      $b.on('click', function (e) {
                          let val = true;
                          let name = el.data('rcloud-params-name');
                          invokeBackend(el, name, val, e);
                      });
                    });
                } else if(el.is('form')) {
                  if(!isSubmitEventBound(el)) {
                    el.submit(onFormSubmit(el, 
                        function(el, values) {
                            invokeBackend(el, el.get(0).name, values, {type : 'submit' } );
                        }));
                  }
                }
          };
          
          if(window.RCloudParams && RCloudParams.observer) {
            RCloudParams.observer.disconnect();
          }

          var observer = new MutationObserver(function(mutations) {
            _.forEach(mutations, (m) => { 
              _.forEach(m.addedNodes, (n) => {
                  if($(n).data('rcloud-params') && $(n).data('rcloud-params') === 'TRUE') {
                    attachCallbacks(n);
                  }
                  _.forEach($(n).find('[data-rcloud-params="TRUE"]'), attachCallbacks);
              });
            });
          });

          observer.observe(document, {attributes: false, childList: true, characterData: false, subtree:true});
          
          window.RCloudParams = {
            observer
          };
          
          _varmap = querystring.parse();
          k(null, _varmap);
        },
        // copied over from rcloud.web - need to be moved back to caps.R       
        appendDiv: function (context_id, div, content, k) {
            executeInCellResultProcessingLoop(context_id, function(result_div) {
              if (_.isFunction(content)) content = content();
              if (div) {
                $(div).append(content);
              } else {
                result_div.append(content);
              }
            });
            k(true);
        },
        prependDiv: function (context_id, div, content, k) {
            executeInCellResultProcessingLoop(context_id, function(result_div) {
              if (_.isFunction(content)) content = content();
              if (div) {
                $(div).prepend(content);
              } else {
                result_div.prepend(content);
              }
            });
            k(true);
        },
        setDiv: function (context_id, div, content, k) {
            executeInCellResultProcessingLoop(context_id, function(result_div) {
              if (_.isFunction(content)) content = content();
              if (div) {
                $(div).empty();
                $(div).append(content);
              } else {
                result_div.empty();
                result_div.append(content);
              }
            });
            k(true);
        },
        
        waitForReactiveForm:  function (context_id, form_id, k) {
            try {
                
                executeInCellResultProcessingLoop(context_id, function(result_div) {
                  let form = $('form[name="'+ form_id + '"]');
                  if (form.length > 0) {
    
                    validateForm(form);
                    form.off('submit');
                    form.submit(onFormSubmit(form, 
                      function(form, values) {
                          invokeBackend(form, form.get(0).name, values, {type : 'submit' } );
                      }));
                    
                    form.submit();
                  }
                  
              });
                  } catch (err) {
                    console.error(err);
                  } finally {
                    k();
                    return true;
                  }
        },
        
        waitForForm: function (context_id, form_id, k) {
            disableCallbacksForForm(form_id);
            executeInCellResultProcessingLoop(context_id, function(result_div) {
              let form = $('form[name="'+ form_id + '"]');
              if(form.length > 0) {
                
                validateForm(form);
                form.off('submit');
                
                form.submit(onFormSubmit(form, 
                  function(form, values) {
                    k(null, values);
                    enableCallbacksForForm(form.get(0).name);
                    form.find('button[type="submit"]').attr('disabled', 'disabled');
                  }, 
                  function(form, err) {
                    k(err, null);
                    enableCallbacksForForm(form.get(0).name);
                    form.find('button[type="submit"]').attr('disabled', 'disabled');
                  }));
              }
              
          });
        },
        
        hideCellSource: function(cell_id, k) {
          try {
            let matching_cells = _.filter(shell.notebook.model.cells, (c) => { 
              return c.id() == cell_id; 
            });
            if (matching_cells.length > 0) {
              _.forEach(matching_cells, (c) => {
                _.forEach(c.views, (v) => {
                  if(v.hide_source) {
                    v.hide_source(true);
                  }
                })
              });
            } else {
              console.error("Cell with id " + cell_id + " not found!");
            }
          } finally {
            k();
          }
        },
        
        hideCurrentCellSource: function(context_id, k) {
          try {
            executeInCellResultProcessingLoop(context_id, function(result_div) {
              let filename = result_div.closest('.notebook-cell').get(0).id;
              let cell = _.filter(shell.notebook.view.model.cells, (c) => { return filename === c.filename(); });
              if(cell.length === 0) {
                console.error('Cell for context ${context_id} not found.');
              } else {
                _.forEach(cell, (c) => { _.forEach(c.views, (v) => { 
                  if(v.hide_source) v.hide_source(true); 
                })});
              }
            })
          } finally {
            k();
          }
        },
        
        runCell: function(cell_id, k) {
          try {
            let matching_cells = _.filter(shell.notebook.model.cells, (c) => { 
              return c.id() == cell_id; 
            });
            if (matching_cells.length > 0) {
              shell.run_notebook_cells([cell_id]);
            } else {
              console.error("Cell with id " + cell_id + " not found!");
            }
          } finally {
            k();
          }
        },
        
        runCells: function(cell_ids, k) {
          try {
            let matching_cells = _.filter(shell.notebook.model.cells, (c) => { 
              return cell_ids.indexOf(c.id()) >= 0; 
            });
            if (matching_cells.length > 0) {
              shell.run_notebook_cells(cell_ids);
            } else {
              console.error("Cells with ids " + cell_ids + " not found!");
            }
          } finally {
            k();
          }
        },
        
        runCellsFrom: function(cell_id, k) {
          try {
            let matching_cells = _.filter(shell.notebook.model.cells, (c) => { 
              return c.id() == cell_id; 
            });
            if (matching_cells.length > 0) {
                shell.run_notebook_from(cell_id);
            } else {
              console.error("Cell with id " + cell_id + " not found!");
            }
          } finally {
            k();
          }
        },
        
        stopExecution: function(k) {
          try {
            RCloud.UI.processing_queue.stopGracefully();
          } finally {
            k();
          }
        },
        
        log: function(content, k) {
            console.log(content);
            k();
        },

        debug: function(content, k) {
            console.debug(content);
            k();
        },
    };
    window.RCloud.params = { instance:  result };
    return result;
})()) /*jshint -W033 */ // this is an expression not a statement
