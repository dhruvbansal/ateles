var Ateles = {

  Url: function(string) {

    this.url = string

    this.scheme = function() {
      var parts = this.url.split('://');
      return (parts.length == 1 ? 'http' : parts[0]);
    }

    this.host_and_path = function() {
      var parts         = this.url.split('://');
      return (parts.length == 1 ? parts[0] : parts[1]);
    }
    
    this.host = function() {
      return this.host_and_path().split('/')[0].replace(/\/$/, '');
    }

    this.path = function() {
      var parts = this.host_and_path().split('/');
      return (parts.length == 1 ? '/' : '/' + parts.slice(1).join('/').replace(/\/$/, ''));
    }

    this.is_root = function() {
      return this.path() == '/';
    }

    this.basename = function() {
      if (this.is_root()) {
	return '/';
      }
      var parts = this.path().split('/');
      return parts[parts.length - 1];
    }

    this.dirname = function() {
      var parts = this.path().slice(1).split('/');
      return (parts.length == 1 ? '/' : '/' + parts.slice(0,parts.length - 1).join('/').replace(/\//, ''));
    }

    this.dirparts = function() {
      return (this.dirname() == '/' ? ['/'] : ['/'].concat(this.dirname().split('/').slice(1)));
    }

    this.yql_url = function() {
      return this.scheme() + '://query.yahooapis.com/v1/public/yql?q=' + escape('SELECT * FROM html WHERE url="' + this.url + '" AND xpath="//a"') + '&format=json';
    }

    this.fragment = function() {
      return /^#/.test(this.url);
    }

    this.expand_url = function(url_string) {
      if (/:\/\//.test(url_string)) {
	return new Ateles.Url(url_string);
      } else {
	return new Ateles.Url(this.scheme() + '://' + this.host() + url_string);
      }
      // FIXME add ../../ type paths....
    }
    
  },
  
  Tree: function(selector) {

    this.selector = selector;
    
    this.container = $(selector);

    this.dirs = {};
    
    this.pages = {};

    this.queue = [];

    this.has_dir = function(path) {
      return this.dirs.hasOwnProperty(path);
    }

    this.has_page = function(path) {
      return this.pages.hasOwnProperty(path);
    }

    this.empty = function() {
      this.container.empty();
      this.dirs = {};
      this.pages = {};
    }

    this.max_requests = 10;

    this.requests = 0;

    this.too_many_requests = function() {
      return this.requests >= this.max_requests;
    }

    this.scrape_next_page = function() {
      if (this.too_many_requests()) {
	alert("Too many scrape requests; giving up.");
      } else {
	this.requests += 1;
	var path = this.queue.shift();
	if (path == undefined) {
	  alert("Finished scraping");
	} else {
	  this.pages[path].scrape();
	}
      }
      
    }
    
  },
  

  Page: function(tree, url) {

    this.tree = tree
    
    this.url  = url

    this.content = $('<li class="file"><p class="basename"><a target="_blank" class="source" href="' + this.url.url + '">' + this.url.basename() + '</a><img class="spinner" src="/spinner.gif" /></p><span class="link_counts"><span class="total"><span class="count"></span> total</span><span class="same-page"><span class="count"></span> back to this page itself</span><span class="cross-host"><span class="count"></span> to a different domain</span><span class="repeated"><span class="count"></span> to an already scraped page</span><span class="new"><span class="count"></span> new links</span></p>');

    this.links = {
      total:      0,
      same_page:  0,
      cross_host: 0,
      repeated:   0,
      new:        0
    }

    this.update_link_counts = function() {
      this.content.find('span.link_counts span.total span.count').html(this.links.total);
      this.content.find('span.link_counts span.same-page span.count').html(this.links.same_page);
      this.content.find('span.link_counts span.cross-host span.count').html(this.links.cross_host);
      this.content.find('span.link_counts span.repeated span.count').html(this.links.repeated);
      this.content.find('span.link_counts span.new span.count').html(this.links.new);
      this.content.find('span.link_counts').show();
    }

    this.parent = function() {
      if (this.tree.has_dir(this.url.dirname())) {
	return this.tree.dirs[this.url.dirname()];
      } else {
	return new Ateles.Dir(tree, new Ateles.Url(this.url.dirname())).insert()
      }
    }

    this.insert = function() {
      this.tree.pages[this.url.path()] = this;
      this.parent().folder().append(this.content);
      this.tree.queue.push(this.url.path());
      return this;
    }

    this.error = function(message) {
      this.content.find('div.basename').append('<div class="error"><p>' + message + '</p></div>');
    }

    this.turn_off_spinner = function() {
      this.content.find('img.spinner').hide();
    }

    this.scrape = function() {
      var tree  = this.tree;
      var page  = this;
      console.log(tree);
      // if (tree.too_many_requests()) { return false; }
      // tree.requests += 1;
      $.jsonp({
	url: page.url.yql_url(),
	callbackParameter: "callback",
	beforeSend: function(options) {
	},
	success: function(data, status) {
	  page.links.total = data.query.results.a.length;
	  for (var i=0; i<page.links.total; i++) {
	    var link = data.query.results.a[i];
	    if (link.href == undefined) { continue; }
	    var new_url = page.url.expand_url(link.href);
	    if (new_url.fragment()) {
	      page.links.same_page += 1;
	    } else if (new_url.host() != url.host()) {
	      page.links.cross_host += 1;
	    } else if (tree.has_page(new_url.path())) {
	      page.links.repeated += 1;
	    } else {
	      var new_page = new Ateles.Page(tree, new_url);
	      new_page.insert()
	      page.links.new += 1;
	    }
	  }
	},
	error: function(options, status) {
	  if (status == 'timeout') {
	    page.error("Timed out when connecting to URL.");
	  } else {
	    page.error("Error in connecting to URL.");
	  }
	},
	complete: function(options, status) {
	  page.update_link_counts();
	  page.turn_off_spinner();
	  tree.scrape_next_page();
	}
      });
    }

  },

  Dir: function(tree, url) {

    this.tree = tree
    
    this.url  = url
    
    this.content = $('<li><p class="basename">' + this.url.basename() + '</p><ul class="folder"></ul></li>');

    this.folder = function() {
      return this.content.find('ul.folder').first();
    }

    this.parent = function() {
      if (this.url.is_root()) {
	return this.tree.container;
      } else if (this.tree.has_dir(this.url.dirname())) {
	return this.tree.dirs[this.url.dirname()];
      } else {
	return new Ateles.Dir(tree, new Ateles.Url(this.url.dirname())).insert()
      }
    }

    this.insert = function() {
      this.tree.dirs[this.url.path()] = this;
      if (this.url.is_root()) {
	this.parent().append(this.content);
      } else {
	this.parent().folder().append(this.content);
      }
      return this;
    }
  },

  Scraper: function(url_string, tree_selector) {

    this.base_url = new Ateles.Url(url_string);
    
    this.tree_selector = tree_selector;
    this.tree = new Ateles.Tree(tree_selector);
    
    this.scrape = function() {
      this.tree.empty();
      first_page = new Ateles.Page(this.tree, this.base_url);
      first_page.insert();
      this.tree.scrape_next_page();
      return false;
    }

  }

}
