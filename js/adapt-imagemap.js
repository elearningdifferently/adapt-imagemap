define([
  'coreViews/componentView',
  'coreJS/adapt',
  'libraries/jquery.rwdImageMaps.min'
], function(ComponentView, Adapt, RwdImageMaps) {
    
    var ComponentView = require('coreViews/componentView');
    var Adapt = require('coreJS/adapt');

    var ImageMap = ComponentView.extend({

        isPopupOpen: false,
        
        initialize: function() {
            this.listenTo(Adapt, 'remove', this.remove);
            this.listenTo(this.model, 'change:_isVisible', this.toggleVisibility);
            this.listenTo(Adapt, 'accessibility:toggle', this.onAccessibilityToggle);
            
            this.model.set('_globals', Adapt.course.get('_globals'));
            
            _.bindAll(this, 'onKeyUp');
            
            this.preRender();
            
            if (this.model.get('_canCycleThroughPagination') === undefined) {
                this.model.set('_canCycleThroughPagination', false);
            }
            if (Adapt.device.screenSize == 'large') {
                this.render();
            } else {
                this.reRender();
            }
        },

        events: function() {
            return {
                'click .imagemap-map-area': 'onMapAreaClicked',
                'click .imagemap-popup-done': 'closePopup',
                'click .imagemap-popup-nav .back': 'previousImageMap',
                'click .imagemap-popup-nav .next': 'nextImageMap'
            }
        },

        preRender: function() {
            this.listenTo(Adapt, 'device:changed', this.reRender, this);

            // Checks to see if the imagemap should be reset on revisit
            this.checkIfResetOnRevisit();
        },

        postRender: function() {
            this.renderState();
            this.$('.imagemap-widget').imageready(_.bind(function() {
                this.setReadyStatus();
            }, this));
            
            this.setupEventListeners();
        },

        // Used to check if the imagemap should reset on revisit
        checkIfResetOnRevisit: function() {
            var isResetOnRevisit = this.model.get('_isResetOnRevisit');

            // If reset is enabled set defaults
            if (isResetOnRevisit) {
                this.model.reset(isResetOnRevisit);

                _.each(this.model.get('_items'), function(item) {
                    item._isVisited = false;
                });
            }
        },

        reRender: function() {
            if (Adapt.device.screenSize != 'large') {
                return;
                // this.replaceWithNarrative();
            }
        },

        inview: function(event, visible, visiblePartX, visiblePartY) {
            if (visible) {
                if (visiblePartY === 'top') {
                    this._isVisibleTop = true;
                } else if (visiblePartY === 'bottom') {
                    this._isVisibleBottom = true;
                } else {
                    this._isVisibleTop = true;
                    this._isVisibleBottom = true;
                }

                if (this._isVisibleTop && this._isVisibleBottom) {
                    this.$('.component-inner').off('inview');
                    this.setCompletionStatus();
                }
            }
        },

        replaceWithNarrative: function() {
            if (!Adapt.componentStore.narrative) throw "Narrative not included in build";
            var Narrative = Adapt.componentStore.narrative;

            var model = this.prepareNarrativeModel();
            var newNarrative = new Narrative({ model: model });
            var $container = $(".component-container", $("." + this.model.get("_parentId")));

            newNarrative.reRender();
            newNarrative.setupNarrative();
            $container.append(newNarrative.$el);
            Adapt.trigger('device:resize');
            _.defer(_.bind(function () {
                this.remove();
            }, this));
        },

        prepareNarrativeModel: function() {
            var model = this.model;
            model.set('_component', 'narrative');
            model.set('_wasImageMap', true);
            model.set('originalBody', model.get('body'));
            model.set('originalInstruction', model.get('instruction'));
            if (model.get('mobileBody')) {
                model.set('body', model.get('mobileBody'));
            }
            if (model.get('mobileInstruction')) {
                model.set('instruction', model.get('mobileInstruction'));
            }

            return model;
        },

        applyNavigationClasses: function (index) {
            var $nav = this.$('.imagemap-popup-nav'),
                itemCount = this.$('.imagemap-item').length;

            $nav.removeClass('first').removeClass('last');
            this.$('.imagemap-popup-done').a11y_cntrl_enabled(true);
            if(index <= 0 && !this.model.get('_canCycleThroughPagination')) {
                this.$('.imagemap-popup-nav').addClass('first');
                this.$('.imagemap-popup-controls.back').a11y_cntrl_enabled(false);
                this.$('.imagemap-popup-controls.next').a11y_cntrl_enabled(true);
            } else if (index >= itemCount-1 && !this.model.get('_canCycleThroughPagination')) {
                this.$('.imagemap-popup-nav').addClass('last');
                this.$('.imagemap-popup-controls.back').a11y_cntrl_enabled(true);
                this.$('.imagemap-popup-controls.next').a11y_cntrl_enabled(false);
            } else {
                this.$('.imagemap-popup-controls.back').a11y_cntrl_enabled(true);
                this.$('.imagemap-popup-controls.next').a11y_cntrl_enabled(true);
            }
            var classes = this.model.get("_items")[index]._classes 
                ? this.model.get("_items")[index]._classes
                : '';  // _classes has not been defined
      
            this.$('.imagemap-popup').attr('class', 'imagemap-popup ' + 'item-' + index + ' ' + classes);

        },

        onMapAreaClicked: function (event) {
            if(event) event.preventDefault();
            
            this.$('.imagemap-popup-inner').a11y_on(false);
            this.$('.imagemap-item').hide().removeClass('active');
            
            var $currentHotSpot = this.$('.' + $(event.currentTarget).data('id'));
            $currentHotSpot.show().addClass('active');
            
            var currentIndex = this.$('.imagemap-item.active').index();
            this.setVisited(currentIndex);
            
            this.openPopup();
           
            this.applyNavigationClasses(currentIndex);
        },
        
        openPopup: function() {
            var currentIndex = this.$('.imagemap-item.active').index();
            this.$('.imagemap-popup-count .current').html(currentIndex + 1);
            this.$('.imagemap-popup-count .total').html(this.$('.imagemap-item').length);
            this.$('.imagemap-popup').attr('class', 'imagemap-popup item-' + currentIndex).show();
            this.$('.imagemap-popup-inner .active').a11y_on(true);
            
            this.isPopupOpen = true;
              
            Adapt.trigger('popup:opened',  this.$('.imagemap-popup-inner'));

            this.$('.imagemap-popup-inner .active').a11y_focus();
            
            this.setupEscapeKey();
        },

        closePopup: function(event) {
            if(event) event.preventDefault();
            
            this.$('.imagemap-popup').hide();
            
            this.isPopupOpen = false;
            
            Adapt.trigger('popup:closed',  this.$('.imagemap-popup-inner'));
        },

        previousImageMap: function (event) {
            event.preventDefault();
            var currentIndex = this.$('.imagemap-item.active').index();

            if (currentIndex === 0 && !this.model.get('_canCycleThroughPagination')) {
                return;
            } else if (currentIndex === 0 && this.model.get('_canCycleThroughPagination')) {
                currentIndex = this.model.get('_items').length;
            }

            this.$('.imagemap-item.active').hide().removeClass('active');
            this.$('.imagemap-item').eq(currentIndex-1).show().addClass('active');
            this.setVisited(currentIndex-1);
            this.$('.imagemap-popup-count .current').html(currentIndex);
            this.$('.imagemap-popup-inner').a11y_on(false);

            this.applyNavigationClasses(currentIndex-1);
            this.$('.imagemap-popup-inner .active').a11y_on(true);
            this.$('.imagemap-popup-inner .active').a11y_focus();
        },

        nextImageMap: function (event) {
            event.preventDefault();
            var currentIndex = this.$('.imagemap-item.active').index();
            if (currentIndex === (this.model.get('_items').length-1) && !this.model.get('_canCycleThroughPagination')) {
                return;
            } else if (currentIndex === (this.model.get('_items').length-1) && this.model.get('_canCycleThroughPagination')) {
                currentIndex = -1;
            }
            this.$('.imagemap-item.active').hide().removeClass('active');
            this.$('.imagemap-item').eq(currentIndex+1).show().addClass('active');
            this.setVisited(currentIndex+1);
            this.$('.imagemap-popup-count .current').html(currentIndex+2);
            this.$('.imagemap-popup-inner').a11y_on(false);

            this.applyNavigationClasses(currentIndex+1);
            this.$('.imagemap-popup-inner .active').a11y_on(true);
            this.$('.imagemap-popup-inner .active').a11y_focus();
        },

        setVisited: function(index) {
            var item = this.model.get('_items')[index];
            item._isVisited = true;

            var $pin = this.$('.imagemap-graphic-pin').eq(index);
            $pin.addClass('visited');
            // append the word 'visited.' to the pin's aria-label
            var visitedLabel = this.model.get('_globals')._accessibility._ariaLabels.visited + ".";
            $pin.attr('aria-label', function(index, val) {return val + " " + visitedLabel});

            $.a11y_alert("visited");

            this.checkCompletionStatus();
        },

        getVisitedItems: function() {
            return _.filter(this.model.get('_items'), function(item) {
                return item._isVisited;
            });
        },

        checkCompletionStatus: function() {
            if (this.getVisitedItems().length == this.model.get('_items').length) {
                this.trigger('allItems');
            }
        },

        onCompletion: function() {
            this.setCompletionStatus();
            if (this.completionEvent && this.completionEvent != 'inview') {
                this.off(this.completionEvent, this);
            }
        },

        setupEventListeners: function() {
            this.completionEvent = (!this.model.get('_setCompletionOn')) ? 'allItems' : this.model.get('_setCompletionOn');
            if (this.completionEvent !== 'inview') {
                this.on(this.completionEvent, _.bind(this.onCompletion, this));
            } else {
                this.$('.component-widget').on('inview', _.bind(this.inview, this));
            }
        },
        
        setupEscapeKey: function() {
            var hasAccessibility = Adapt.config.has('_accessibility') && Adapt.config.get('_accessibility')._isActive;

            if (!hasAccessibility && this.isPopupOpen) {
                $(window).on("keyup", this.onKeyUp);
            } else {
                $(window).off("keyup", this.onKeyUp);
            }
        },

        onAccessibilityToggle: function() {
            this.setupEscapeKey();
        },

        onKeyUp: function(event) {
            if (event.which != 27) return;
            
            event.preventDefault();

            this.closePopup();
        }

    });

    Adapt.register('imagemap', ImageMap);

    return ImageMap;

});
