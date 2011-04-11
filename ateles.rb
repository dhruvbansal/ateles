require 'rubygems'
require 'sinatra'
require 'haml'

get '/' do
  haml :scrape_from_base_url
end

